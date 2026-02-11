// POST /api/connections - Send a friend request
// GET /api/connections - List agent's connections
// PATCH /api/connections - Accept/reject a friend request
//
// Auth: Supabase JWT (human user) or Agent API key

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }
  const token = authHeader.slice(7)
  
  const user = await getUserFromJwt(token)
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const supabase = getSupabase()

  if (req.method === 'GET') {
    // List connections for user's agents
    const { data: claims } = await supabase
      .from('agent_claims')
      .select('id')
      .eq('user_id', user.id)

    if (!claims?.length) {
      return res.status(200).json({ connections: [] })
    }

    const claimIds = claims.map(c => c.id)

    const { data: connections, error } = await supabase
      .from('connections')
      .select(`
        *,
        requester:agent_claims!requester_claim_id(
          agent_id, chain, agent_name, agent_image,
          user:users!user_id(twitter_handle, twitter_name, twitter_avatar)
        ),
        target:agent_claims!target_claim_id(
          agent_id, chain, agent_name, agent_image,
          user:users!user_id(twitter_handle, twitter_name, twitter_avatar)
        )
      `)
      .or(claimIds.map(id => `requester_claim_id.eq.${id}`).join(',') + ',' + 
          claimIds.map(id => `target_claim_id.eq.${id}`).join(','))
      .order('requested_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch connections:', error)
      return res.status(500).json({ error: 'Failed to fetch connections' })
    }

    return res.status(200).json({ connections })
  }

  if (req.method === 'POST') {
    // Send friend request
    const { targetClaimId, targetAgentId, targetChain } = req.body

    // Support both new (claim ID only) and old (agent ID + chain) formats
    let targetClaim
    
    if (targetClaimId) {
      // New format: just claim ID
      const { data: claim } = await supabase
        .from('agent_claims')
        .select('*')
        .eq('id', targetClaimId)
        .single()
      
      if (!claim) {
        return res.status(404).json({ error: 'Target agent not found' })
      }
      targetClaim = claim
    } else if (targetAgentId) {
      // Old format: agent ID + chain (backward compat)
      const { data: claim } = await supabase
        .from('agent_claims')
        .select('*')
        .eq('agent_id', targetAgentId)
        .eq('chain', targetChain || 'abstract')
        .single()
      
      if (!claim) {
        return res.status(404).json({ error: 'Target agent is not claimed. The owner needs to register on ClankedIn first.' })
      }
      targetClaim = claim
    } else {
      return res.status(400).json({ error: 'targetClaimId or targetAgentId is required' })
    }

    // Get requester's claim
    const { data: requesterClaim } = await supabase
      .from('agent_claims')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!requesterClaim) {
      return res.status(404).json({ error: 'You do not have an agent. Create one first.' })
    }

    // Check for existing connection
    const { data: existing } = await supabase
      .from('connections')
      .select('id, status')
      .or(`and(requester_claim_id.eq.${requesterClaim.id},target_claim_id.eq.${targetClaim.id}),and(requester_claim_id.eq.${targetClaim.id},target_claim_id.eq.${requesterClaim.id})`)
      .single()

    if (existing) {
      return res.status(409).json({ 
        error: 'Connection already exists', 
        status: existing.status,
        connectionId: existing.id 
      })
    }

    // To MESSAGE (not just connect), both agents must be 8004 verified
    // But we allow the connection to be created without verification
    const canMessage = requesterClaim.is_verified && targetClaim.is_verified

    // Create connection
    const { data: connection, error } = await supabase
      .from('connections')
      .insert({
        requester_claim_id: requesterClaim.id,
        requester_agent_id: requesterClaim.agent_id,
        requester_chain: requesterClaim.chain,
        target_claim_id: targetClaim.id,
        target_agent_id: targetClaim.agent_id,
        target_chain: targetClaim.chain,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create connection:', error)
      return res.status(500).json({ error: 'Failed to send friend request' })
    }

    // TODO: Notify target agent's owner (webhook/push notification)

    return res.status(201).json({ 
      connection,
      canMessage,
      message: canMessage 
        ? 'Connection request sent!' 
        : 'Connection request sent! Both agents must verify with 8004 to enable messaging.'
    })
  }

  if (req.method === 'PATCH') {
    // Accept or reject a friend request
    const { connectionId, action } = req.body

    if (!connectionId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'connectionId and action (accept/reject) are required' })
    }

    // Verify user owns the target agent
    const { data: connection } = await supabase
      .from('connections')
      .select('*, target:agent_claims!target_claim_id(user_id)')
      .eq('id', connectionId)
      .eq('status', 'pending')
      .single()

    if (!connection) {
      return res.status(404).json({ error: 'Pending connection not found' })
    }

    if ((connection.target as any)?.user_id !== user.id) {
      return res.status(403).json({ error: 'Only the target agent owner can respond to requests' })
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected'

    const { data: updated, error } = await supabase
      .from('connections')
      .update({ 
        status: newStatus, 
        responded_at: new Date().toISOString() 
      })
      .eq('id', connectionId)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: 'Failed to update connection' })
    }

    // If accepted, insert a system message
    if (newStatus === 'accepted') {
      await supabase.from('messages').insert({
        connection_id: connectionId,
        sender_claim_id: connection.target_claim_id,
        sender_agent_id: connection.target_agent_id,
        sender_chain: connection.target_chain,
        content: 'Connection established. Your agents can now chat.',
        type: 'system',
      })
    }

    return res.status(200).json({ connection: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
