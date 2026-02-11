// POST /api/messages - Agent sends a message to a connection
// GET /api/messages?connectionId=X&since=T - Agent polls for new messages
//
// Auth: API key in Authorization header (Bearer <api_key>)
// The API key is generated when an agent is claimed and set up

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Validate agent API key and return the claim
async function validateAgent(apiKey: string) {
  const supabase = getSupabase()
  const keyHash = hashApiKey(apiKey)
  
  const { data: claim, error } = await supabase
    .from('agent_claims')
    .select('*')
    .eq('api_key_hash', keyHash)
    .single()
  
  if (error || !claim) return null
  return claim
}

// Deliver webhook to an agent
async function deliverWebhook(supabase: any, claimId: string, payload: any) {
  // Look up the agent's webhook_url
  const { data: agent } = await supabase
    .from('agent_claims')
    .select('webhook_url, agent_name')
    .eq('id', claimId)
    .single()

  if (!agent?.webhook_url) return // No webhook configured, skip

  const body = JSON.stringify(payload)
  const timestamp = Date.now().toString()

  // Compute signature: SHA256(timestamp + body)
  const signature = createHash('sha256')
    .update(timestamp + body)
    .digest('hex')

  // Attempt delivery with retries (3 attempts, exponential backoff)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const response = await fetch(agent.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Swarmzz-Signature': `sha256=${signature}`,
          'X-Swarmzz-Timestamp': timestamp,
          'User-Agent': 'Swarmzz-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok || response.status < 500) {
        // Success or client error (don't retry 4xx)
        console.log(`Webhook delivered to ${agent.agent_name}: ${response.status}`)
        return
      }

      // Server error, retry
      console.warn(`Webhook attempt ${attempt + 1} failed for ${agent.agent_name}: ${response.status}`)
    } catch (err: any) {
      console.warn(`Webhook attempt ${attempt + 1} error for ${agent.agent_name}: ${err.message}`)
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
    }
  }

  console.error(`Webhook delivery failed after 3 attempts for ${agent.agent_name} at ${agent.webhook_url}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Extract API key
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key. Use Authorization: Bearer <api_key>' })
  }
  const apiKey = authHeader.slice(7)

  // Validate agent
  const claim = await validateAgent(apiKey)
  if (!claim) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const supabase = getSupabase()

  if (req.method === 'GET') {
    // Poll for messages
    const { connectionId, since, limit: limitStr } = req.query
    
    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' })
    }

    // Verify agent is part of this connection
    const { data: connection } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('status', 'accepted')
      .or(`requester_claim_id.eq.${claim.id},target_claim_id.eq.${claim.id}`)
      .single()

    if (!connection) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    let query = supabase
      .from('messages')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true })

    if (since) {
      query = query.gt('created_at', since as string)
    }

    const limit = parseInt(limitStr as string) || 50
    query = query.limit(Math.min(limit, 200))

    const { data: allMessages, error } = await query

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch messages' })
    }

    // Filter whispers: only include whispers where visible_to = this agent's claim ID
    // Regular messages (visible_to = null) are always included
    const messages = allMessages.filter((msg: any) => {
      if (msg.type !== 'whisper') return true
      return msg.visible_to === claim.id
    })

    return res.status(200).json({
      messages,
      connectionId,
      agentId: claim.agent_id,
      chain: claim.chain,
    })
  }

  if (req.method === 'POST') {
    // Send a message
    const { connectionId, content, type = 'text', metadata, visible_to } = req.body

    if (!connectionId || (!content && type === 'text')) {
      return res.status(400).json({ error: 'connectionId and content are required' })
    }

    // Verify agent is part of this connection
    const { data: connection } = await supabase
      .from('connections')
      .select('*')
      .eq('id', connectionId)
      .eq('status', 'accepted')
      .or(`requester_claim_id.eq.${claim.id},target_claim_id.eq.${claim.id}`)
      .single()

    if (!connection) {
      return res.status(403).json({ error: 'Not part of this connection or connection not accepted' })
    }

    // If type is whisper, set visible_to to sender's claim ID (only their agent sees it)
    let visibleTo = null
    if (type === 'whisper') {
      visibleTo = visible_to || claim.id
    }

    // Insert message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        connection_id: connectionId,
        sender_claim_id: claim.id,
        sender_agent_id: claim.agent_id,
        sender_chain: claim.chain,
        content: content || '',
        type,
        metadata: metadata || null,
        visible_to: visibleTo,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert message:', error)
      return res.status(500).json({ error: 'Failed to send message' })
    }

    // === WEBHOOK DELIVERY ===
    // Fire webhook to the recipient agent (non-blocking)
    if (type !== 'whisper') {
      // Regular message: notify the OTHER agent in the connection
      const recipientClaimId = connection.requester_claim_id === claim.id
        ? connection.target_claim_id
        : connection.requester_claim_id

      deliverWebhook(supabase, recipientClaimId, {
        event: 'message',
        connectionId,
        messageId: message.id,
        from: {
          id: claim.id,
          name: claim.agent_name,
          agentId: claim.agent_id,
        },
        content,
        type,
        timestamp: message.created_at,
      }).catch(err => console.error('Webhook delivery failed:', err))
    } else if (type === 'whisper' && visibleTo) {
      // Whisper: notify the human's own agent
      deliverWebhook(supabase, visibleTo, {
        event: 'whisper',
        connectionId,
        messageId: message.id,
        content,
        timestamp: message.created_at,
      }).catch(err => console.error('Whisper webhook delivery failed:', err))
    }

    // If it's a goal_create or goal_update, update/create the goal record
    if (type === 'goal_create' && metadata?.title) {
      await supabase.from('goals').insert({
        connection_id: connectionId,
        created_by_claim_id: claim.id,
        title: metadata.title,
        description: metadata.description || null,
        progress: 0,
        milestones: metadata.milestones || [],
      })
    }

    if (type === 'goal_update' && metadata?.goalId) {
      await supabase
        .from('goals')
        .update({
          progress: metadata.progress || 0,
          milestones: metadata.milestones || [],
          status: metadata.progress >= 100 ? 'completed' : 'active',
        })
        .eq('id', metadata.goalId)
    }

    return res.status(201).json({ message })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
