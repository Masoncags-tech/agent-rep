// POST /api/claims - Claim an agent (verify 8004 ownership)
// GET /api/claims - Get user's claimed agents
// PATCH /api/claims - Update webhook URL, agent info
//
// Auth: Supabase JWT

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

const CHAIN_IDS: Record<string, number> = {
  abstract: 2741,
  base: 8453,
}

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey)
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

// Verify on-chain that the given address owns the agent
async function verifyOwnership(agentId: number, chain: string, expectedOwner: string): Promise<boolean> {
  const rpcUrl = CHAIN_RPCS[chain]
  if (!rpcUrl) return false

  try {
    const client = createPublicClient({
      transport: http(rpcUrl),
    })

    const owner = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: [{
        name: 'ownerOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'address' }],
      }],
      functionName: 'ownerOf',
      args: [BigInt(agentId)],
    } as any)

    return (owner as string).toLowerCase() === expectedOwner.toLowerCase()
  } catch {
    return false
  }
}

// Fetch agent registration data from tokenURI
async function fetchAgentData(agentId: number, chain: string) {
  const rpcUrl = CHAIN_RPCS[chain]
  if (!rpcUrl) return null

  try {
    const client = createPublicClient({
      transport: http(rpcUrl),
    })

    const uri = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: [{
        name: 'tokenURI',
        type: 'function',
        stateMutability: 'view',
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
    if (uriStr.startsWith('ipfs://')) {
      fetchUri = uriStr.replace('ipfs://', 'https://ipfs.io/ipfs/')
    }

    const res = await fetch(fetchUri, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
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
    const { data: claims, error } = await supabase
      .from('agent_claims')
      .select('*')
      .eq('user_id', user.id)
      .order('claimed_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch claims' })
    }

    return res.status(200).json({ claims })
  }

  if (req.method === 'POST') {
    // Claim an agent
    const { agentId, chain = 'abstract', ownerAddress } = req.body

    if (!agentId || !ownerAddress) {
      return res.status(400).json({ error: 'agentId and ownerAddress are required' })
    }

    // Check if already claimed
    const { data: existing } = await supabase
      .from('agent_claims')
      .select('id, user_id')
      .eq('agent_id', agentId)
      .eq('chain', chain)
      .single()

    if (existing) {
      if (existing.user_id === user.id) {
        return res.status(200).json({ message: 'Already claimed by you', claimId: existing.id })
      }
      return res.status(409).json({ error: 'This agent is already claimed by another user' })
    }

    // Verify on-chain ownership
    const isOwner = await verifyOwnership(agentId, chain, ownerAddress)
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Ownership verification failed. The provided address does not own this agent on-chain.' 
      })
    }

    // Fetch agent data
    const agentData = await fetchAgentData(agentId, chain)

    // Generate API key for the agent
    const apiKey = `ck_${randomBytes(32).toString('hex')}`
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex')

    // Create claim
    const { data: claim, error } = await supabase
      .from('agent_claims')
      .insert({
        user_id: user.id,
        agent_id: agentId,
        chain,
        owner_address: ownerAddress.toLowerCase(),
        agent_name: agentData?.name || `Agent #${agentId}`,
        agent_image: agentData?.image || null,
        agent_description: agentData?.description || null,
        api_key_hash: apiKeyHash,
        is_verified: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create claim:', error)
      return res.status(500).json({ error: 'Failed to claim agent' })
    }

    // Return the API key ONCE (never stored in plaintext)
    return res.status(201).json({ 
      claim,
      apiKey, // Show this once, user must save it
      message: 'Agent claimed successfully. Save your API key, it will not be shown again.',
    })
  }

  if (req.method === 'PATCH') {
    const { claimId, webhookUrl, agentName, agentImage, agentDescription } = req.body

    if (!claimId) {
      return res.status(400).json({ error: 'claimId is required' })
    }

    // Verify ownership
    const { data: claim } = await supabase
      .from('agent_claims')
      .select('*')
      .eq('id', claimId)
      .eq('user_id', user.id)
      .single()

    if (!claim) {
      return res.status(403).json({ error: 'Not your claim' })
    }

    const updates: Record<string, any> = {}
    if (webhookUrl !== undefined) updates.webhook_url = webhookUrl
    if (agentName !== undefined) updates.agent_name = agentName
    if (agentImage !== undefined) updates.agent_image = agentImage
    if (agentDescription !== undefined) updates.agent_description = agentDescription

    const { data: updated, error } = await supabase
      .from('agent_claims')
      .update(updates)
      .eq('id', claimId)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: 'Failed to update claim' })
    }

    return res.status(200).json({ claim: updated })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
