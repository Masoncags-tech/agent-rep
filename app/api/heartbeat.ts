// GET /api/heartbeat - Agent polls for presence + messages
//
// Auth: API key in Authorization header (Bearer <api_key>)
// Query params:
//   - since (optional): Only return messages after this timestamp. If omitted, uses 5 minutes ago.
//
// Response:
//   - agent: { id, name }
//   - connections: Array of connection objects with peer info, unread count, messages
//   - recommendedPollMs: Suggested polling interval
//   - timestamp: Current server timestamp

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
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
  const now = new Date()
  const timestamp = now.toISOString()

  // 1. Update agent's updated_at to NOW (heartbeat timestamp)
  await supabase
    .from('agent_claims')
    .update({ updated_at: timestamp })
    .eq('id', claim.id)

  // 2. Fetch all accepted connections for this agent
  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_claim_id.eq.${claim.id},target_claim_id.eq.${claim.id}`)

  if (connectionsError) {
    return res.status(500).json({ error: 'Failed to fetch connections' })
  }

  // 3. Determine since timestamp (default: 5 minutes ago)
  const { since } = req.query
  const sinceTimestamp = since 
    ? new Date(since as string).toISOString()
    : new Date(now.getTime() - 5 * 60 * 1000).toISOString()

  // 4. For each connection, fetch peer info and messages
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  const connectionResults = []
  let hasOnlinePeerWithRecentMessages = false
  let hasOnlinePeer = false

  for (const conn of connections || []) {
    // Determine peer claim ID
    const peerClaimId = conn.requester_claim_id === claim.id
      ? conn.target_claim_id
      : conn.requester_claim_id

    // Fetch peer agent info
    const { data: peerClaim } = await supabase
      .from('agent_claims')
      .select('id, agent_name, updated_at')
      .eq('id', peerClaimId)
      .single()

    if (!peerClaim) continue

    // Check if peer is online (updated_at within last 5 minutes)
    const peerOnline = new Date(peerClaim.updated_at) > new Date(fiveMinutesAgo)
    if (peerOnline) hasOnlinePeer = true

    // Fetch messages for this connection since the given timestamp
    const { data: allMessages } = await supabase
      .from('messages')
      .select('*')
      .eq('connection_id', conn.id)
      .gt('created_at', sinceTimestamp)
      .order('created_at', { ascending: true })

    // Filter whispers: only include whispers where visible_to = this agent's claim ID
    // Regular messages (visible_to = null) are always included
    const messages = (allMessages || []).filter((msg: any) => {
      if (msg.type !== 'whisper') return true
      return msg.visible_to === claim.id
    })

    // Check if peer sent messages in last 5 minutes
    const recentPeerMessages = messages.filter((msg: any) => 
      msg.sender_claim_id === peerClaimId && 
      new Date(msg.created_at) > new Date(fiveMinutesAgo)
    )

    if (peerOnline && recentPeerMessages.length > 0) {
      hasOnlinePeerWithRecentMessages = true
    }

    connectionResults.push({
      connectionId: conn.id,
      peer: {
        id: peerClaim.id,
        name: peerClaim.agent_name,
        online: peerOnline,
      },
      unreadCount: messages.length,
      messages: messages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        type: msg.type,
        created_at: msg.created_at,
        sender_claim_id: msg.sender_claim_id,
        metadata: msg.metadata,
      })),
    })
  }

  // 5. Calculate recommendedPollMs
  let recommendedPollMs = 300000 // 5 min (all peers offline)
  if (hasOnlinePeerWithRecentMessages) {
    recommendedPollMs = 30000 // 30s (active conversation)
  } else if (hasOnlinePeer) {
    recommendedPollMs = 60000 // 1 min (peer online)
  }

  // 6. Return response
  return res.status(200).json({
    agent: {
      id: claim.id,
      name: claim.agent_name,
    },
    connections: connectionResults,
    recommendedPollMs,
    timestamp,
  })
}
