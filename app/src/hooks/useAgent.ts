import { useState, useEffect } from 'react'
import { createPublicClient, http, parseAbiItem } from 'viem'
import { abstractMainnet, baseMainnet, SUPPORTED_CHAINS, type ChainConfig } from '../config/chain'
import {
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  identityRegistryAbi,
  reputationRegistryAbi,
} from '../config/contracts'

// Create clients for each chain
const clients = new Map<number, ReturnType<typeof createPublicClient>>()

function getClient(chainId: number) {
  if (!clients.has(chainId)) {
    const config = SUPPORTED_CHAINS.find(c => c.chain.id === chainId)
    if (!config) throw new Error(`Unknown chain: ${chainId}`)
    clients.set(chainId, createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    }))
  }
  return clients.get(chainId)!
}

// Convenience
export const abstractClient = getClient(abstractMainnet.id)
export const baseClient = getClient(baseMainnet.id)

export interface AgentRegistration {
  type?: string
  name: string
  description: string
  image?: string
  services?: Array<{ name: string; endpoint: string; version?: string }>
  active?: boolean
  supportedTrust?: string[]
}

export interface AgentMint {
  agentId: number
  owner: string
  chainId: number
}

async function fetchRegistration(uri: string): Promise<AgentRegistration | null> {
  if (!uri) return null
  try {
    if (uri.startsWith('data:')) {
      const match = uri.match(/base64,(.+)/)
      if (match) return JSON.parse(atob(match[1]))
    }
    let fetchUri = uri
    if (uri.startsWith('ipfs://')) fetchUri = uri.replace('ipfs://', 'https://ipfs.io/ipfs/')
    const res = await fetch(fetchUri, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Binary search for the highest minted agent ID on a given chain
async function findMaxAgentId(client: ReturnType<typeof createPublicClient>): Promise<number> {
  const abi = identityRegistryAbi
  
  async function exists(id: number): Promise<boolean> {
    try {
      await client.readContract({
        address: IDENTITY_REGISTRY,
        abi,
        functionName: 'ownerOf',
        args: [BigInt(id)],
      })
      return true
    } catch {
      return false
    }
  }

  // Find upper bound
  let lo = 0, hi = 1000
  while (await exists(hi)) { lo = hi; hi *= 2; if (hi > 100000) break }
  
  // Binary search
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await exists(mid)) lo = mid; else hi = mid
  }
  return lo
}

// Get total agent counts across all chains
export function useAgentCounts() {
  const [counts, setCounts] = useState<{ chainId: number; label: string; count: number }[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const results = await Promise.all(
        SUPPORTED_CHAINS.map(async (config) => {
          const client = getClient(config.chain.id)
          const maxId = await findMaxAgentId(client)
          return { chainId: config.chain.id, label: config.label, count: maxId + 1 }
        })
      )
      if (cancelled) return
      setCounts(results)
      setTotal(results.reduce((sum, r) => sum + r.count, 0))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { counts, total, loading }
}

// Get recent agent mints across all chains (for Explore page)
export function useRecentAgents(limit = 100) {
  const [agents, setAgents] = useState<AgentMint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadChain(config: ChainConfig): Promise<AgentMint[]> {
      const client = getClient(config.chain.id)
      
      try {
        if (config.logChunkSize) {
          // Chunked scanning (Base, etc)
          const currentBlock = Number(await client.getBlockNumber())
          const scanBlocks = 50000 // ~28 hours on Base
          const from = currentBlock - scanBlocks
          const logs = await client.getLogs({
            address: IDENTITY_REGISTRY,
            event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
            fromBlock: BigInt(from),
            toBlock: BigInt(currentBlock),
            args: { from: '0x0000000000000000000000000000000000000000' as `0x${string}` },
          })
          return logs.map(l => ({
            agentId: Number(l.args.tokenId),
            owner: l.args.to as string,
            chainId: config.chain.id,
          }))
        } else {
          // Full scan (Abstract, etc)
          const logs = await client.getLogs({
            address: IDENTITY_REGISTRY,
            event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
            fromBlock: 0n,
            toBlock: 'latest',
            args: { from: '0x0000000000000000000000000000000000000000' as `0x${string}` },
          })
          return logs.map(l => ({
            agentId: Number(l.args.tokenId),
            owner: l.args.to as string,
            chainId: config.chain.id,
          }))
        }
      } catch (e) {
        console.error(`Failed to load agents from ${config.label}:`, e)
        return []
      }
    }

    async function load() {
      const chainResults = await Promise.all(SUPPORTED_CHAINS.map(loadChain))
      if (cancelled) return
      
      // Merge all chains, most recent first (highest IDs first per chain, interleaved)
      const all = chainResults.flat()
      all.sort((a, b) => b.agentId - a.agentId) // Sort by ID desc (newest first)
      setAgents(all.slice(0, limit))
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [limit])

  return { agents, loading }
}

// Legacy hook: get all agents from Abstract only (for backward compat)
export function useAllAgents() {
  const [agents, setAgents] = useState<AgentMint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    abstractClient.getLogs({
      address: IDENTITY_REGISTRY,
      event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
      fromBlock: 0n,
      toBlock: 'latest',
      args: { from: '0x0000000000000000000000000000000000000000' as `0x${string}` },
    }).then(logs => {
      const mints = logs.map(l => ({
        agentId: Number(l.args.tokenId),
        owner: l.args.to as string,
        chainId: 2741,
      }))
      mints.reverse()
      setAgents(mints)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return { agents, loading, total: agents.length }
}

// Load registration for a single agent (tries each chain)
export function useAgent(agentId: number, preferChainId?: number) {
  const [registration, setRegistration] = useState<AgentRegistration | null>(null)
  const [owner, setOwner] = useState<string>('')
  const [registrationUri, setRegistrationUri] = useState<string>('')
  const [chainId, setChainId] = useState<number>(preferChainId || 0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function tryChain(cid: number): Promise<{ uri: string; owner: string } | null> {
      try {
        const client = getClient(cid)
        const [uri, ownerAddr] = await Promise.all([
          client.readContract({
            address: IDENTITY_REGISTRY,
            abi: identityRegistryAbi,
            functionName: 'tokenURI',
            args: [BigInt(agentId)],
          }).catch(() => ''),
          client.readContract({
            address: IDENTITY_REGISTRY,
            abi: identityRegistryAbi,
            functionName: 'ownerOf',
            args: [BigInt(agentId)],
          }).catch(() => ''),
        ])
        if (ownerAddr) return { uri: uri as string, owner: ownerAddr as string }
        return null
      } catch {
        return null
      }
    }

    async function load() {
      try {
        setLoading(true)
        
        // If we have a preferred chain, try it first
        const chainsToTry = preferChainId
          ? [preferChainId, ...SUPPORTED_CHAINS.filter(c => c.chain.id !== preferChainId).map(c => c.chain.id)]
          : SUPPORTED_CHAINS.map(c => c.chain.id)

        for (const cid of chainsToTry) {
          const result = await tryChain(cid)
          if (result && result.owner) {
            if (cancelled) return
            setOwner(result.owner)
            setRegistrationUri(result.uri)
            setChainId(cid)
            
            if (result.uri) {
              const reg = await fetchRegistration(result.uri)
              if (!cancelled) setRegistration(reg)
            }
            return
          }
        }
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    }

    load()
    return () => { cancelled = true }
  }, [agentId, preferChainId])

  return { agentId, owner, registration, registrationUri, chainId, loading }
}

export function useReputation(agentId: number, chainId?: number) {
  const [summary, setSummary] = useState<any>(null)
  const [feedback, setFeedback] = useState<any[]>([])
  const [clients_, setClients] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const cid = chainId || abstractMainnet.id

    async function load() {
      try {
        setLoading(true)
        const client = getClient(cid)
        const [sum, fb, cl] = await Promise.all([
          client.readContract({
            address: REPUTATION_REGISTRY,
            abi: reputationRegistryAbi,
            functionName: 'getSummary',
            args: [BigInt(agentId)],
          }).catch(() => null),
          client.readContract({
            address: REPUTATION_REGISTRY,
            abi: reputationRegistryAbi,
            functionName: 'readAllFeedback',
            args: [BigInt(agentId)],
          }).catch(() => []),
          client.readContract({
            address: REPUTATION_REGISTRY,
            abi: reputationRegistryAbi,
            functionName: 'getClients',
            args: [BigInt(agentId)],
          }).catch(() => []),
        ])

        if (cancelled) return
        if (sum) setSummary(sum)
        if (fb) setFeedback(fb as any[])
        if (cl) setClients(cl as string[])
      } catch {}
      finally { if (!cancelled) setLoading(false) }
    }

    load()
    return () => { cancelled = true }
  }, [agentId, chainId])

  return { summary, feedback, clients: clients_, loading }
}

// Batch load registrations for a list of agent IDs on a specific chain
export async function batchLoadRegistrations(
  agentIds: number[],
  chainId: number = abstractMainnet.id
): Promise<Map<number, AgentRegistration | null>> {
  const map = new Map<number, AgentRegistration | null>()
  const client = getClient(chainId)

  const promises = agentIds.map(async (id) => {
    try {
      const uri = await client.readContract({
        address: IDENTITY_REGISTRY,
        abi: identityRegistryAbi,
        functionName: 'tokenURI',
        args: [BigInt(id)],
      }).catch(() => '')

      const reg = (uri as string) ? await fetchRegistration(uri as string) : null
      map.set(id, reg)
    } catch {
      map.set(id, null)
    }
  })

  await Promise.all(promises)
  return map
}

// Get chain config for display
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find(c => c.chain.id === chainId)
}
