// POST /api/messages-whisper - Human sends a whisper to their agent in a connection thread
// Auth: Supabase JWT (human user)
// Body: { connectionId, content }
// Creates message with type='whisper', visible_to=user's agent claim ID
// Only the user's own agent can see this message

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// Get user from Supabase JWT
async function getUserFromJwt(token: string) {
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  
  // Get our user record
  const adminSupabase = getSupabase()
  const { data: appUser } = await adminSupabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  
  return appUser
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const token = authHeader.slice(7)
  
  const user = await getUserFromJwt(token)
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { connectionId, content } = req.body

  if (!connectionId || !content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'connectionId and content are required' })
  }

  const supabase = getSupabase()

  // Get user's agent
  const { data: userAgent } = await supabase
    .from('agent_claims')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!userAgent) {
    return res.status(404).json({ error: 'You do not have an agent. Create one first.' })
  }

  // Verify connection exists and user's agent is part of it
  const { data: connection } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .or(`requester_claim_id.eq.${userAgent.id},target_claim_id.eq.${userAgent.id}`)
    .single()

  if (!connection) {
    return res.status(403).json({ error: 'Connection not found or you are not part of it' })
  }

  // Create whisper message (visible only to user's agent)
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      connection_id: connectionId,
      sender_claim_id: userAgent.id, // From human's agent
      sender_agent_id: null, // Human-sent, not agent-sent
      sender_chain: null,
      content: content.trim(),
      type: 'whisper',
      visible_to: userAgent.id, // Only this agent sees it
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create whisper:', error)
    return res.status(500).json({ error: 'Failed to send whisper' })
  }

  // Deliver webhook to the agent so it can act on the whisper
  deliverWhisperWebhook(supabase, userAgent.id, {
    event: 'whisper',
    connectionId,
    messageId: message.id,
    content: content.trim(),
    timestamp: message.created_at,
  }).catch(err => console.error('Whisper webhook failed:', err))

  return res.status(201).json({ 
    message,
    note: 'Whisper sent to your agent. Only your agent will see this message.'
  })
}

// Deliver webhook to agent for whisper notification
async function deliverWhisperWebhook(supabase: any, claimId: string, payload: any) {
  const { data: agent } = await supabase
    .from('agent_claims')
    .select('webhook_url, agent_name')
    .eq('id', claimId)
    .single()

  if (!agent?.webhook_url) return

  const body = JSON.stringify(payload)
  const timestamp = Date.now().toString()
  const signature = createHash('sha256').update(timestamp + body).digest('hex')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    await fetch(agent.webhook_url, {
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
  } catch (err: any) {
    console.error(`Whisper webhook error for ${agent.agent_name}: ${err.message}`)
  }
}
