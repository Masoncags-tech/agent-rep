// POST /api/agents - Create agent (name, avatar_url, bio) → returns API key
// GET /api/agents - Get current user's agent
// PATCH /api/agents - Update agent profile (name, avatar_url, bio, webhook_url)
//
// Auth: Supabase JWT (human user)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function generateApiKey(): string {
  return `ck_${randomBytes(32).toString('hex')}`
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
    // Get current user's agent
    const { data: agent, error } = await supabase
      .from('agent_claims')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Failed to fetch agent:', error)
      return res.status(500).json({ error: 'Failed to fetch agent' })
    }

    if (!agent) {
      return res.status(404).json({ error: 'No agent found. Create one first.' })
    }

    // Don't return API key hash
    const { api_key_hash, ...agentData } = agent

    return res.status(200).json({ agent: agentData })
  }

  if (req.method === 'POST') {
    // Create agent
    const { name, avatar_url, bio } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Agent name is required' })
    }

    // Check if user already has an agent
    const { data: existing } = await supabase
      .from('agent_claims')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return res.status(409).json({ error: 'You already have an agent. Use PATCH to update it.' })
    }

    // Generate API key
    const apiKey = generateApiKey()
    const keyHash = hashApiKey(apiKey)

    // Create agent claim
    const { data: agent, error } = await supabase
      .from('agent_claims')
      .insert({
        user_id: user.id,
        agent_name: name.trim(),
        agent_image: avatar_url?.trim() || null,
        agent_bio: bio?.trim() || null,
        api_key_hash: keyHash,
        is_verified: false,
        agent_id: null, // Not yet verified with 8004
        chain: null,
        owner_address: null,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create agent:', error)
      return res.status(500).json({ error: 'Failed to create agent' })
    }

    // Return agent data + API key (only time it's shown)
    const { api_key_hash, ...agentData } = agent

    return res.status(201).json({ 
      agent: agentData,
      apiKey: apiKey,
      message: 'Agent created! Save this API key - it will not be shown again.'
    })
  }

  if (req.method === 'PATCH') {
    // Update agent profile
    const { name, avatar_url, bio, webhook_url } = req.body

    // Get user's agent
    const { data: agent } = await supabase
      .from('agent_claims')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!agent) {
      return res.status(404).json({ error: 'No agent found. Create one first.' })
    }

    // Build update object
    const updates: any = {}
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      updates.agent_name = name.trim()
    }
    if (avatar_url !== undefined) {
      updates.agent_image = avatar_url?.trim() || null
    }
    if (bio !== undefined) {
      updates.agent_bio = bio?.trim() || null
    }
    if (webhook_url !== undefined) {
      updates.webhook_url = webhook_url?.trim() || null
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    const { data: updated, error } = await supabase
      .from('agent_claims')
      .update(updates)
      .eq('id', agent.id)
      .select()
      .single()

    if (error) {
      console.error('Failed to update agent:', error)
      return res.status(500).json({ error: 'Failed to update agent' })
    }

    const { api_key_hash, ...agentData } = updated

    return res.status(200).json({ agent: agentData })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
