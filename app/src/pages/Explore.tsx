import { useState, useEffect } from 'react'
import { useRecentAgents, useAgentCounts, batchLoadRegistrations } from '../hooks/useAgent'
import { ProfileCard } from '../components/ProfileCard'
import type { AgentRegistration } from '../hooks/useAgent'
import { SUPPORTED_CHAINS } from '../config/chain'

interface AgentWithReg {
  agentId: number
  owner: string
  chainId: number
  registration: AgentRegistration | null
}

export function Explore() {
  const { agents: recentMints, loading: mintsLoading } = useRecentAgents(500)
  const { total, counts, loading: countsLoading } = useAgentCounts()
  const [agents, setAgents] = useState<AgentWithReg[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [chainFilter, setChainFilter] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 30

  useEffect(() => {
    if (mintsLoading || recentMints.length === 0) return

    async function loadPage() {
      setLoading(true)
      const filtered = chainFilter
        ? recentMints.filter(m => m.chainId === chainFilter)
        : recentMints
      const batch = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

      // Group by chain for batch loading
      const byChain = new Map<number, number[]>()
      for (const m of batch) {
        if (!byChain.has(m.chainId)) byChain.set(m.chainId, [])
        byChain.get(m.chainId)!.push(m.agentId)
      }

      // Load registrations per chain
      const allRegs = new Map<string, AgentRegistration | null>()
      await Promise.all(
        Array.from(byChain.entries()).map(async ([cid, ids]) => {
          const regMap = await batchLoadRegistrations(ids, cid)
          for (const [id, reg] of regMap) {
            allRegs.set(`${cid}-${id}`, reg)
          }
        })
      )

      const loaded: AgentWithReg[] = batch.map(m => ({
        agentId: m.agentId,
        owner: m.owner,
        chainId: m.chainId,
        registration: allRegs.get(`${m.chainId}-${m.agentId}`) || null,
      }))

      setAgents(prev => page === 0 ? loaded : [...prev, ...loaded])
      setLoading(false)
    }

    loadPage()
  }, [recentMints, mintsLoading, page, chainFilter])

  // Reset page when filter changes
  useEffect(() => {
    setPage(0)
    setAgents([])
  }, [chainFilter])

  const searched = search
    ? agents.filter((a) => {
        const n = a.registration?.name?.toLowerCase() || ''
        const d = a.registration?.description?.toLowerCase() || ''
        const id = `#${a.agentId}`
        return n.includes(search.toLowerCase()) || d.includes(search.toLowerCase()) || id.includes(search)
      })
    : agents

  const filteredMintCount = chainFilter
    ? recentMints.filter(m => m.chainId === chainFilter).length
    : recentMints.length

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Explore Agents</h1>
        <p className="text-[var(--text-secondary)]">
          {!countsLoading && total > 0
            ? `${total.toLocaleString()} agents across ${counts.length} chains`
            : 'Loading agents...'
          }
        </p>
      </div>

      {/* Chain filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setChainFilter(null)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            chainFilter === null
              ? 'bg-[var(--accent)] text-black'
              : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
          }`}
        >
          All Chains
        </button>
        {SUPPORTED_CHAINS.map(config => {
          const count = counts.find(c => c.chainId === config.chain.id)
          return (
            <button
              key={config.chain.id}
              onClick={() => setChainFilter(config.chain.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                chainFilter === config.chain.id
                  ? 'text-black'
                  : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
              style={chainFilter === config.chain.id ? { backgroundColor: config.color } : undefined}
            >
              {config.emoji} {config.label}
              {count ? ` (${count.count.toLocaleString()})` : ''}
            </button>
          )
        })}
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search agents by name, description, or #id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      {(loading && agents.length === 0) || mintsLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-[var(--bg-card)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-[var(--text-secondary)]">
            Showing {searched.length} agents
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {searched.map((agent) => (
              <ProfileCard
                key={`${agent.chainId}-${agent.agentId}`}
                agentId={agent.agentId}
                registration={agent.registration}
                owner={agent.owner}
                chainId={agent.chainId}
              />
            ))}
          </div>

          {/* Load more */}
          {!search && agents.length < filteredMintCount && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
                className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load more agents'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
