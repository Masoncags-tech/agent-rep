// POST /api/artifacts - Agent creates or updates an artifact in a connection workspace
// GET /api/artifacts?connectionId=X - List artifacts for a connection
// PATCH /api/artifacts?id=X - Agent updates artifact content/status
//
// Auth: API key (agent) or Supabase JWT (human)

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

// Authenticate: try API key first, then JWT
async function authenticate(req: VercelRequest) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = getSupabase()

  // Try API key (agents)
  if (token.startsWith('ck_')) {
    const hash = hashApiKey(token)
    const { data: agent } = await supabase
      .from('agent_claims')
      .select('id, agent_name, user_id')
      .eq('api_key_hash', hash)
      .single()

    if (agent) return { type: 'agent' as const, claimId: agent.id, agentName: agent.agent_name, userId: agent.user_id }
  }

  // Try JWT (humans)
  const anonSupabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)
  const { data: { user }, error } = await anonSupabase.auth.getUser(token)
  if (!error && user) {
    const { data: appUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single()

    if (appUser) {
      // Get their agent claim
      const { data: claim } = await supabase
        .from('agent_claims')
        .select('id')
        .eq('user_id', appUser.id)
        .single()

      return { type: 'human' as const, claimId: claim?.id, userId: appUser.id }
    }
  }

  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabase()

  // GET — list artifacts for a connection
  if (req.method === 'GET') {
    const connectionId = req.query.connectionId as string
    if (!connectionId) return res.status(400).json({ error: 'connectionId required' })

    // Verify caller is part of this connection
    const { data: conn } = await supabase
      .from('connections')
      .select('id')
      .eq('id', connectionId)
      .or(`requester_claim_id.eq.${auth.claimId},target_claim_id.eq.${auth.claimId}`)
      .single()

    if (!conn) return res.status(403).json({ error: 'Not part of this connection' })

    const { data: artifacts, error } = await supabase
      .from('artifacts')
      .select(`
        *,
        creator:created_by_claim_id (agent_name, agent_image),
        comments:artifact_comments (
          id, content, created_at,
          user:user_id (twitter_handle, twitter_name)
        )
      `)
      .eq('connection_id', connectionId)
      .order('updated_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ artifacts: artifacts || [] })
  }

  // POST with action=comment — human adds a comment to an artifact (check first)
  if (req.method === 'POST' && req.body?.action === 'comment') {
    if (auth.type !== 'human') return res.status(403).json({ error: 'Only humans can comment' })

    const { artifactId, content } = req.body
    if (!artifactId || !content?.trim()) return res.status(400).json({ error: 'artifactId and content required' })

    const { data: artifact } = await supabase
      .from('artifacts')
      .select('id, connection:connection_id (requester_claim_id, target_claim_id)')
      .eq('id', artifactId)
      .single()

    if (!artifact) return res.status(404).json({ error: 'Artifact not found' })

    const aConn = artifact.connection as any
    if (!auth.claimId || (auth.claimId !== aConn.requester_claim_id && auth.claimId !== aConn.target_claim_id)) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    const { data: comment, error } = await supabase
      .from('artifact_comments')
      .insert({
        artifact_id: artifactId,
        user_id: auth.userId,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ comment })
  }

  // POST — create new artifact
  if (req.method === 'POST') {
    if (auth.type !== 'agent') return res.status(403).json({ error: 'Only agents can create artifacts' })

    const { connectionId, title, content, type, language, status } = req.body
    if (!connectionId || !title) return res.status(400).json({ error: 'connectionId and title required' })

    // Verify agent is part of this connection
    const { data: conn } = await supabase
      .from('connections')
      .select('id')
      .eq('id', connectionId)
      .or(`requester_claim_id.eq.${auth.claimId},target_claim_id.eq.${auth.claimId}`)
      .single()

    if (!conn) return res.status(403).json({ error: 'Not part of this connection' })

    const { data: artifact, error } = await supabase
      .from('artifacts')
      .insert({
        connection_id: connectionId,
        created_by_claim_id: auth.claimId,
        title,
        content: content || '',
        type: type || 'markdown',
        language: language || null,
        status: status || 'draft',
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    // Also post a system message about the new artifact
    await supabase.from('messages').insert({
      connection_id: connectionId,
      sender_claim_id: auth.claimId,
      sender_agent_id: null,
      content: `📄 Created artifact: "${title}"`,
      type: 'system',
    })

    return res.status(201).json({ artifact })
  }

  // PATCH — update artifact (content, status, version bump)
  if (req.method === 'PATCH') {
    const artifactId = req.query.id as string
    if (!artifactId) return res.status(400).json({ error: 'id query param required' })

    const { content, title, status, language } = req.body

    // Get artifact and verify ownership
    const { data: existing } = await supabase
      .from('artifacts')
      .select('*, connection:connection_id (requester_claim_id, target_claim_id)')
      .eq('id', artifactId)
      .single()

    if (!existing) return res.status(404).json({ error: 'Artifact not found' })

    // Verify caller is part of the connection
    const conn = existing.connection as any
    if (auth.claimId !== conn.requester_claim_id && auth.claimId !== conn.target_claim_id) {
      return res.status(403).json({ error: 'Not part of this connection' })
    }

    const updates: any = { updated_at: new Date().toISOString() }
    if (content !== undefined) {
      updates.content = content
      updates.version = existing.version + 1
    }
    if (title !== undefined) updates.title = title
    if (status !== undefined) updates.status = status
    if (language !== undefined) updates.language = language

    const { data: artifact, error } = await supabase
      .from('artifacts')
      .update(updates)
      .eq('id', artifactId)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ artifact })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
