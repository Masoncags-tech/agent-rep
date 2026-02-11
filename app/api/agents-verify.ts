// POST /api/agents-verify - Verify 8004 ownership
// Auth: Supabase JWT (human user)
// Body: { tokenId, chain, ownerAddress }
// Checks on-chain that ownerAddress owns tokenId on chain
// Updates agent_claims with 8004 data

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http } from 'viem'
import { base, abstractTestnet } from 'viem/chains'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ERC-8004 Identity Registry address (same on Abstract + Base)
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'

// Chain configs
const CHAINS: Record<string, any> = {
  abstract: {
    ...abstractTestnet,
    rpcUrls: {
      default: { http: ['https://api.mainnet.abs.xyz'] }
    }
  },
  base: {
    ...base,
    rpcUrls: {
      default: { http: ['https://base-rpc.publicnode.com'] }
    }
  }
}

// ERC-8004 ABI (ownerOf + tokenURI)
const IDENTITY_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

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

// Verify on-chain ownership
async function verifyOwnership(
  chain: string, 
  tokenId: number, 
  ownerAddress: string
): Promise<{ valid: boolean; error?: string }> {
  const chainConfig = CHAINS[chain]
  if (!chainConfig) {
    return { valid: false, error: 'Unsupported chain. Use "abstract" or "base".' }
  }

  try {
    const client = createPublicClient({
      chain: chainConfig,
      transport: http()
    })

    const owner = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)]
    } as any)

    if ((owner as string).toLowerCase() !== ownerAddress.toLowerCase()) {
      return { valid: false, error: 'Owner address does not match on-chain owner' }
    }

    return { valid: true }
  } catch (error: any) {
    console.error('On-chain verification failed:', error)
    return { valid: false, error: error.message || 'Failed to verify ownership on-chain' }
  }
}

// Fetch metadata from 8004 contract
async function fetchMetadata(chain: string, tokenId: number): Promise<{ name?: string; image?: string }> {
  const chainConfig = CHAINS[chain]
  if (!chainConfig) return {}

  try {
    const client = createPublicClient({
      chain: chainConfig,
      transport: http()
    })

    const tokenURI = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)]
    } as any) as string

    // Fetch metadata from URI
    let metadataUrl = tokenURI
    if (tokenURI.startsWith('ipfs://')) {
      metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')
    }

    const response = await fetch(metadataUrl)
    if (!response.ok) return {}

    const metadata = await response.json()
    return {
      name: metadata.name || undefined,
      image: metadata.image || undefined
    }
  } catch (error) {
    console.error('Failed to fetch metadata:', error)
    return {}
  }
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

  const { tokenId, chain, ownerAddress } = req.body

  // Validate inputs
  if (!tokenId || typeof tokenId !== 'number') {
    return res.status(400).json({ error: 'tokenId (number) is required' })
  }
  if (!chain || !['abstract', 'base'].includes(chain)) {
    return res.status(400).json({ error: 'chain must be "abstract" or "base"' })
  }
  if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
    return res.status(400).json({ error: 'Valid ownerAddress (Ethereum address) is required' })
  }

  const supabase = getSupabase()

  // Get user's agent
  const { data: agent } = await supabase
    .from('agent_claims')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!agent) {
    return res.status(404).json({ error: 'No agent found. Create an agent first.' })
  }

  if (agent.is_verified && agent.agent_id) {
    return res.status(409).json({ 
      error: 'Agent already verified', 
      agent: { 
        tokenId: agent.agent_id, 
        chain: agent.chain 
      } 
    })
  }

  // Verify ownership on-chain
  const verification = await verifyOwnership(chain, tokenId, ownerAddress)
  if (!verification.valid) {
    return res.status(403).json({ error: verification.error || 'Verification failed' })
  }

  // Fetch metadata from 8004 contract
  const metadata = await fetchMetadata(chain, tokenId)

  // Update agent_claims
  const updates: any = {
    agent_id: tokenId,
    chain,
    owner_address: ownerAddress.toLowerCase(),
    is_verified: true,
    verified_at: new Date().toISOString()
  }

  // Update name/image if not already set
  if (metadata.name && !agent.agent_name) {
    updates.agent_name = metadata.name
  }
  if (metadata.image && !agent.agent_image) {
    updates.agent_image = metadata.image
  }

  const { data: updated, error } = await supabase
    .from('agent_claims')
    .update(updates)
    .eq('id', agent.id)
    .select()
    .single()

  if (error) {
    console.error('Failed to update agent:', error)
    return res.status(500).json({ error: 'Failed to update agent verification' })
  }

  const { api_key_hash, ...agentData } = updated

  return res.status(200).json({ 
    agent: agentData,
    message: 'Agent verified with ERC-8004 Identity Registry!'
  })
}
