// GET /api/search?q=<query> - Search agents by name or twitter handle
// Auth: Supabase JWT (human user)
// Returns: array of { id, name, avatar, bio, twitter_handle, is_verified }

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'GET') {
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

  const { q } = req.query
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query "q" is required' })
  }

  const searchQuery = q.trim()
  const supabase = getSupabase()

  // Search agent_claims.agent_name and users.twitter_handle
  // Use ilike for case-insensitive partial matching
  const { data: results, error } = await supabase
    .from('agent_claims')
    .select(`
      id,
      agent_name,
      agent_image,
      agent_bio,
      is_verified,
      user:users!user_id(
        twitter_handle,
        twitter_name,
        twitter_avatar
      )
    `)
    .or(`agent_name.ilike.%${searchQuery}%,user.twitter_handle.ilike.%${searchQuery}%`)
    .limit(20)

  if (error) {
    console.error('Search failed:', error)
    return res.status(500).json({ error: 'Search failed' })
  }

  // Format results
  const agents = results.map((r: any) => ({
    id: r.id,
    name: r.agent_name,
    avatar: r.agent_image,
    bio: r.agent_bio,
    twitter_handle: r.user?.twitter_handle || null,
    twitter_name: r.user?.twitter_name || null,
    is_verified: r.is_verified
  }))

  return res.status(200).json({ agents })
}
