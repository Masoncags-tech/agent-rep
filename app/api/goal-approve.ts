// POST /api/goal-approve - Human approves or rejects a goal
// Auth: Supabase JWT (human user)
//
// Body: { goalId: string, approved: boolean }
// Determines requester vs target based on user's claimed agents

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

async function getUserFromJwt(token: string) {
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth: JWT from signed-in human
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' })
  }

  const user = await getUserFromJwt(authHeader.slice(7))
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { goalId, approved } = req.body
  if (!goalId || typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'goalId and approved (boolean) are required' })
  }

  const supabase = getSupabase()

  // Get the goal with its connection
  const { data: goal, error: goalErr } = await supabase
    .from('goals')
    .select('*, connection:connections!connection_id(*)')
    .eq('id', goalId)
    .single()

  if (goalErr || !goal) {
    return res.status(404).json({ error: 'Goal not found' })
  }

  const conn = goal.connection as any

  // Get user's claims to determine if they're requester or target
  const { data: claims } = await supabase
    .from('agent_claims')
    .select('id')
    .eq('user_id', user.id)

  const claimIds = (claims || []).map((c: any) => c.id)

  const isRequester = claimIds.includes(conn.requester_claim_id)
  const isTarget = claimIds.includes(conn.target_claim_id)

  if (!isRequester && !isTarget) {
    return res.status(403).json({ error: 'You are not part of this connection' })
  }

  // Update the appropriate approval field
  const updates: Record<string, any> = {}

  if (isRequester) {
    updates.requester_approved = approved
  }
  if (isTarget) {
    updates.target_approved = approved
  }

  // If rejecting, set status to abandoned
  if (!approved) {
    updates.status = 'abandoned'
  }

  const { data: updated, error: updateErr } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', goalId)
    .select()
    .single()

  if (updateErr) {
    return res.status(500).json({ error: 'Failed to update goal' })
  }

  // Check if both approved — activate the goal
  if (updated.requester_approved && updated.target_approved && updated.status !== 'active') {
    await supabase
      .from('goals')
      .update({ status: 'active' })
      .eq('id', goalId)

    updated.status = 'active'

    // Insert system message about activation
    await supabase.from('messages').insert({
      connection_id: goal.connection_id,
      sender_claim_id: isRequester ? conn.requester_claim_id : conn.target_claim_id,
      sender_agent_id: isRequester ? conn.requester_agent_id : conn.target_agent_id,
      sender_chain: isRequester ? conn.requester_chain : conn.target_chain,
      content: 'Both humans approved this goal. Work can begin!',
      type: 'system',
    })
  }

  const approvalCount = (updated.requester_approved ? 1 : 0) + (updated.target_approved ? 1 : 0)

  return res.status(200).json({
    goal: updated,
    approvalCount,
    totalRequired: 2,
    fullyApproved: approvalCount === 2,
  })
}
