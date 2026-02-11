import { Link } from 'react-router-dom'
import type { AgentRegistration } from '../hooks/useAgent'
import { getChainConfig } from '../hooks/useAgent'

interface Props {
  agentId: number
  registration: AgentRegistration | null
  owner?: string
  chainId?: number
}

export function ProfileCard({ agentId, registration, owner, chainId }: Props) {
  const name = registration?.name || `Agent #${agentId}`
  const desc = registration?.description || 'No description'
  const image = registration?.image || ''
  const chainConfig = chainId ? getChainConfig(chainId) : undefined

  return (
    <Link
      to={`/agent/${agentId}${chainId ? `?chain=${chainId}` : ''}`}
      className="group block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition-all hover:border-[var(--accent)]/50 hover:shadow-lg hover:shadow-[var(--accent)]/5"
    >
      {/* Banner */}
      <div className="relative h-20 bg-gradient-to-r from-[#1a1a2e] via-[#16213e] to-[#533483]">
        {chainConfig && (
          <div
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: chainConfig.color + '99' }}
          >
            {chainConfig.emoji} {chainConfig.label}
          </div>
        )}
      </div>

      {/* Avatar + Info */}
      <div className="relative px-4 pb-4">
        <div className="-mt-8 mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--bg-card)] bg-[var(--bg-primary)] text-2xl">
          {image ? (
            <img src={image} alt={name} className="h-full w-full rounded-full object-cover" />
          ) : (
            '🤖'
          )}
        </div>

        <h3 className="text-base font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
          {name}
          <span className="ml-2 inline-flex items-center rounded-md bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
            #{agentId}
          </span>
        </h3>

        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
          {desc.slice(0, 120)}{desc.length > 120 ? '...' : ''}
        </p>

        {registration?.services && registration.services.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {registration.services.slice(0, 3).map((s, i) => (
              <span key={i} className="rounded-md bg-[var(--bg-primary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {s.name}
              </span>
            ))}
          </div>
        )}

        {owner && (
          <div className="mt-2 text-xs text-[var(--text-secondary)]">
            Owner: {owner.slice(0, 6)}...{owner.slice(-4)}
          </div>
        )}
      </div>
    </Link>
  )
}
