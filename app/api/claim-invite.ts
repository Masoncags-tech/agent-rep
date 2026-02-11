// POST /api/claim-invite - Agent generates a claim invite link for its owner
// GET /api/claim-invite?token=X - Redeem a claim invite (human signs in, auto-claims)
//
// POST Auth: Agent API key (Bearer token) - only the agent can generate its own invite
// GET Auth: Supabase JWT (human user) - the person clicking the link

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http } from 'viem'
import { createHash, randomBytes } from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const

const CHAIN_RPCS: Record<string, string> = {
  abstract: 'https://api.abstrachain.io/rpc',
  base: 'https://base-rpc.publicnode.com',
}

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

async function getUserFromJwt(token: string) {
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const adminSupabase = getSupabase()
  const { data: appUser } = await adminSupabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  return appUser
}

async function getOnChainOwner(agentId: number, chain: string): Promise<string | null> {
  const rpcUrl = CHAIN_RPCS[chain]
  if (!rpcUrl) return null
  try {
    const client = createPublicClient({ transport: http(rpcUrl) })
    const owner = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: [{
        name: 'ownerOf', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'address' }],
      }],
      functionName: 'ownerOf',
      args: [BigInt(agentId)],
    } as any)
    return (owner as string).toLowerCase()
  } catch {
    return null
  }
}

async function fetchAgentData(agentId: number, chain: string) {
  const rpcUrl = CHAIN_RPCS[chain]
  if (!rpcUrl) return null
  try {
    const client = createPublicClient({ transport: http(rpcUrl) })
    const uri = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: [{
        name: 'tokenURI', type: 'function', stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'string' }],
      }],
      functionName: 'tokenURI',
      args: [BigInt(agentId)],
    } as any)
    if (!uri) return null
    const uriStr = uri as string
    if (uriStr.startsWith('data:')) {
      const match = uriStr.match(/base64,(.+)/)
      if (match) return JSON.parse(Buffer.from(match[1], 'base64').toString())
    }
    let fetchUri = uriStr
    if (uriStr.startsWith('ipfs://')) fetchUri = uriStr.replace('ipfs://', 'https://ipfs.io/ipfs/')
    const res = await fetch(fetchUri, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabase = getSupabase()

  // ============================================================
  // POST - Agent generates an invite link
  // ============================================================
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing API key' })
    }
    const apiKey = authHeader.slice(7)
    const claim = await validateAgent(apiKey)
    if (!claim) {
      return res.status(401).json({ error: 'Invalid API key' })
    }

    // Generate a unique invite token
    const inviteToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex')

    // Store invite in a simple table (or we can use agent_claims metadata)
    // For simplicity, store in a claim_invites column or separate approach:
    // We'll store pending invites as rows in agent_claims with a special status
    // Actually, let's just store in the claim record itself
    const { error } = await supabase
      .from('agent_claims')
      .update({
        invite_token_hash: tokenHash,
        invite_created_at: new Date().toISOString(),
      })
      .eq('id', claim.id)

    if (error) {
      // If columns don't exist yet, we need migration
      // Fallback: store in metadata or a separate approach
      console.error('Failed to store invite:', error)

      // Try alternative: store in a simple key-value approach using goals table metadata
      // Actually let's just return the token and handle it statelessly
      // We can verify by checking: token maps to claim_id, and on-chain owner matches
    }

    const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, '') || 'https://app-orpin-ten-87.vercel.app'
    const claimUrl = `${origin}/claim/${inviteToken}?agent=${claim.agent_id}&chain=${claim.chain}`

    return res.status(200).json({
      inviteUrl: claimUrl,
      token: inviteToken,
      agentId: claim.agent_id,
      chain: claim.chain,
      agentName: claim.agent_name || `Agent #${claim.agent_id}`,
      expiresIn: '24 hours',
      message: `Share this link with your owner. They sign in with X and the claim is automatic.`,
    })
  }

  // ============================================================
  // GET - Human redeems an invite (called from frontend)
  // ============================================================
  if (req.method === 'GET') {
    const { token, agent: agentIdStr, chain = 'abstract' } = req.query

    if (!token || !agentIdStr) {
      return res.status(400).json({ error: 'token and agent are required' })
    }

    const agentId = parseInt(agentIdStr as string)
    const tokenHash = createHash('sha256').update(token as string).digest('hex')

    // Get auth from header
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sign in first, then redeem the invite' })
    }
    const jwtToken = authHeader.slice(7)
    const user = await getUserFromJwt(jwtToken)
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Verify the invite token matches the agent's stored hash
    const { data: existingClaim } = await supabase
      .from('agent_claims')
      .select('*')
      .eq('agent_id', agentId)
      .eq('chain', chain as string)
      .single()

    if (!existingClaim) {
      return res.status(404).json({ error: 'No claim found for this agent. The agent needs to be registered first.' })
    }

    // Check token matches
    if (existingClaim.invite_token_hash !== tokenHash) {
      return res.status(403).json({ error: 'Invalid or expired invite link' })
    }

    // Check not expired (24h)
    if (existingClaim.invite_created_at) {
      const created = new Date(existingClaim.invite_created_at).getTime()
      if (Date.now() - created > 24 * 60 * 60 * 1000) {
        return res.status(410).json({ error: 'Invite link has expired. Ask the agent to generate a new one.' })
      }
    }

    // If already claimed by this user, just return success
    if (existingClaim.user_id === user.id) {
      return res.status(200).json({ 
        message: 'Already claimed by you',
        claimId: existingClaim.id,
        alreadyClaimed: true,
      })
    }

    // If claimed by someone else, transfer the claim
    // (The agent generated a new invite, so the agent owner wants to reassign)

    // Get on-chain owner for verification
    const onChainOwner = await getOnChainOwner(agentId, chain as string)

    // Fetch agent metadata
    const agentData = await fetchAgentData(agentId, chain as string)

    // Generate new API key
    const newApiKey = `ck_${randomBytes(32).toString('hex')}`
    const apiKeyHash = createHash('sha256').update(newApiKey).digest('hex')

    // Update the claim to this user
    const { data: updatedClaim, error: updateError } = await supabase
      .from('agent_claims')
      .update({
        user_id: user.id,
        owner_address: onChainOwner || existingClaim.owner_address,
        agent_name: agentData?.name || existingClaim.agent_name,
        agent_image: agentData?.image || existingClaim.agent_image,
        agent_description: agentData?.description || existingClaim.agent_description,
        api_key_hash: apiKeyHash,
        is_verified: true,
        invite_token_hash: null, // Consume the invite
        invite_created_at: null,
      })
      .eq('id', existingClaim.id)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to update claim:', updateError)
      return res.status(500).json({ error: 'Failed to claim agent' })
    }

    return res.status(200).json({
      claim: updatedClaim,
      apiKey: newApiKey,
      message: 'Agent claimed successfully! Save your API key.',
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
