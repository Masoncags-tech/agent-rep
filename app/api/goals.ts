// POST /api/goals - Agent creates a shared goal
// PATCH /api/goals - Agent updates goal progress
// GET /api/goals?connectionId=X - Get goals for a connection
//
// Auth: Agent API key (Bearer token)

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

async function validateAgent(apiKey: string) {
  const supabase = getSupabase()
  const keyHash = hashApiKey(apiKey)
  
  const { data: claim } = await supabase
    .from('agent_claims')
    .select('*')
    .eq('api_key_hash', keyHash)
    .single()
  
  return claim
}

async function verifyConnectionAccess(supabase: any, connectionId: string, claimId: string) {
  const { data: connection } = await supabase
    .from('connections')
    .select('*')
    .eq('id', connectionId)
    .eq('status', 'accepted')
    .or(`requester_claim_id.eq.${claimId},target_claim_id.eq.${claimId}`)
    .single()
  
  return connection
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' })
  }
  const apiKey = authHeader.slice(7)

  const claim = await validateAgent(apiKey)
  if (!claim) {
    return res.status(401).json({ error: 'Invalid API key' })
  }

  const supabase = getSupabase()

  if (req.method === 'GET') {
    const { connectionId } = req.query
    
    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required' })
    }

    const connection = await verifyConnectionAccess(supabase, connectionId as string, claim.id)
    if (!connection) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch goals' })
    }

    return res.status(200).json({ goals })
  }

  if (req.method === 'POST') {
    const { connectionId, title, description, milestones = [] } = req.body

    if (!connectionId || !title) {
      return res.status(400).json({ error: 'connectionId and title are required' })
    }

    const connection = await verifyConnectionAccess(supabase, connectionId, claim.id)
    if (!connection) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    // Create goal
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .insert({
        connection_id: connectionId,
        created_by_claim_id: claim.id,
        title,
        description: description || null,
        milestones,
      })
      .select()
      .single()

    if (goalError) {
      return res.status(500).json({ error: 'Failed to create goal' })
    }

    // Also insert a goal_create message so it appears in chat
    await supabase.from('messages').insert({
      connection_id: connectionId,
      sender_claim_id: claim.id,
      sender_agent_id: claim.agent_id,
      sender_chain: claim.chain,
      content: '',
      type: 'goal_create',
      metadata: {
        goalId: goal.id,
        title,
        progress: 0,
        milestones,
      },
    })

    return res.status(201).json({ goal })
  }

  if (req.method === 'PATCH') {
    const { goalId, progress, milestones, status } = req.body

    if (!goalId) {
      return res.status(400).json({ error: 'goalId is required' })
    }

    // Get goal and verify access
    const { data: goal } = await supabase
      .from('goals')
      .select('*, connection:connections!connection_id(*)')
      .eq('id', goalId)
      .single()

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' })
    }

    const conn = goal.connection as any
    if (conn.requester_claim_id !== claim.id && conn.target_claim_id !== claim.id) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    const updates: Record<string, any> = {}
    if (progress !== undefined) updates.progress = Math.min(100, Math.max(0, progress))
    if (milestones !== undefined) updates.milestones = milestones
    if (status !== undefined) updates.status = status

    // Auto-complete if progress hits 100
    if (updates.progress === 100 && !status) {
      updates.status = 'completed'
    }

    const { data: updated, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: 'Failed to update goal' })
    }

    // Insert goal_update message
    await supabase.from('messages').insert({
      connection_id: goal.connection_id,
      sender_claim_id: claim.id,
      sender_agent_id: claim.agent_id,
      sender_chain: claim.chain,
      content: '',
      type: 'goal_update',
      metadata: {
        goalId: updated.id,
        title: updated.title,
        progress: updated.progress,
        milestones: updated.milestones,
      },
    })

    return res.status(200).json({ goal: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
