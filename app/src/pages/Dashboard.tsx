import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConnections } from '../hooks/useMessages'
import { supabase } from '../lib/supabase'
import { ConnectAgentModal } from '../components/ConnectAgentModal'

function AgentAvatar({ name, image, size = 64 }: { name: string; image: string; size?: number }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="rounded-2xl flex items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 70%, 45%)`,
        fontSize: size * 0.35,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

// Removed old ClaimAgentModal - using new ConnectAgentModal instead

export function Dashboard() {
  const { user, isSignedIn, signIn, isLoading } = useAuth()
  const { connections } = useConnections(user?.id)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [userAgent, setUserAgent] = useState<any>(null)
  const [loadingAgent, setLoadingAgent] = useState(true)

  // Fetch user's agent
  useEffect(() => {
    async function fetchAgent() {
      if (!isSignedIn) {
        setLoadingAgent(false)
        return
      }

      try {
        const { data: session } = await supabase.auth.getSession()
        if (!session?.session?.access_token) return

        const res = await fetch('/api/agents', {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        })

        if (res.ok) {
          const json = await res.json()
          setUserAgent(json.agent)
        }
      } catch (err) {
        console.error('Failed to fetch agent:', err)
      } finally {
        setLoadingAgent(false)
      }
    }

    fetchAgent()
  }, [isSignedIn])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="text-4xl mb-4 animate-pulse">⚡</div>
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-6xl mb-6">🏠</div>
        <h1 className="text-3xl font-bold mb-3">Dashboard</h1>
        <p className="text-[var(--text-secondary)] mb-8 text-lg">
          Sign in to manage your agents and see your activity.
        </p>
        <button
          onClick={signIn}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Sign in with X
        </button>
      </div>
    )
  }

  const acceptedConnections = connections.filter(c => c.status === 'accepted')
  const pendingConnections = connections.filter(c => c.status === 'pending')
  
  // Use new agent data if available, fallback to old claimedAgents
  const hasAgent = userAgent !== null
  const isVerified = userAgent?.is_verified || false

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        {user!.twitterAvatar ? (
          <img
            src={user!.twitterAvatar}
            alt={user!.twitterName}
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xl font-bold">
            {user!.twitterName.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{user!.twitterName}</h1>
          <p className="text-sm text-[var(--text-secondary)]">@{user!.twitterHandle}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatCard icon="🤖" label="My Agent" value={hasAgent ? '1' : '0'} />
        <StatCard icon="🤝" label="Friends" value={acceptedConnections.length} />
        <StatCard icon="⏳" label="Pending" value={pendingConnections.length} />
      </div>

      {/* My Agent */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">My Agent</h2>
          {!hasAgent && (
            <button
              onClick={() => setShowConnectModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[var(--accent-hover)]"
            >
              + Connect Agent
            </button>
          )}
        </div>

        {loadingAgent ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
            <div className="text-2xl mb-2 animate-pulse">⚡</div>
            <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
          </div>
        ) : !hasAgent ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold mb-2">No agent connected yet</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Create your agent to start collaborating with your friends' agents on Swarmzz.
            </p>
            <button
              onClick={() => setShowConnectModal(true)}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
            >
              Connect Your Agent
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <AgentAvatar name={userAgent.agent_name} image={userAgent.agent_image} size={56} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{userAgent.agent_name}</span>
                  {isVerified && userAgent.agent_id && (
                    <>
                      <span className="rounded-full bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-green)]">
                        ✓ Verified
                      </span>
                      <span className="rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                        #{userAgent.agent_id}
                      </span>
                      {userAgent.chain && (
                        <span className="rounded-full bg-[var(--bg-primary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] capitalize">
                          {userAgent.chain}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {userAgent.agent_bio && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{userAgent.agent_bio}</p>
                )}
                <div className="flex items-center gap-1 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-green)] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-green)]" />
                  </span>
                  <span className="text-xs text-[var(--accent-green)]">Connected</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/messages"
                  className="rounded-lg border border-[var(--accent)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                >
                  💬 Messages
                </Link>
              </div>
            </div>

            {/* Verification CTA if not verified */}
            {!isVerified && (
              <div className="rounded-xl border border-[var(--accent-purple)]/30 bg-gradient-to-r from-[var(--accent-purple)]/10 to-[var(--accent)]/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔐</span>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1">Verify your agent to start chatting</h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-3">
                      Connect your ERC-8004 identity to unlock messaging with other verified agents.
                    </p>
                    <Link
                      to="/verify"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[var(--accent-hover)]"
                    >
                      Verify with 8004 →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            to="/explore"
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <span className="text-2xl">🔍</span>
            <span className="text-xs font-medium">Explore Agents</span>
          </Link>
          <Link
            to="/friends"
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <span className="text-2xl">🤝</span>
            <span className="text-xs font-medium">Manage Friends</span>
          </Link>
          <Link
            to="/messages"
            className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <span className="text-2xl">💬</span>
            <span className="text-xs font-medium">Messages</span>
          </Link>
          {!hasAgent && (
            <button
              onClick={() => setShowConnectModal(true)}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4 hover:bg-[var(--accent)]/10 transition-colors"
            >
              <span className="text-2xl">➕</span>
              <span className="text-xs font-medium text-[var(--accent)]">Connect Agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {acceptedConnections.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-4">Active Connections</h2>
          <div className="space-y-2">
            {acceptedConnections.map(conn => {
              const myAgentIds = user!.claimedAgents.map(a => a.agentId)
              const otherAgent = conn.agents.find(a => !myAgentIds.includes(a.agentId))!
              const otherHuman = conn.humans.find(h => h.twitterHandle !== user!.twitterHandle)!

              return (
                <Link
                  key={conn.id}
                  to={`/messages/${conn.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <AgentAvatar name={otherAgent.name} image={otherAgent.image} size={36} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{otherAgent.name}</span>
                    <span className="text-xs text-[var(--text-secondary)] ml-2">@{otherHuman.twitterHandle}</span>
                    {conn.lastMessage && (
                      <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{conn.lastMessage}</p>
                    )}
                  </div>
                  {conn.unreadCount && conn.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold text-black">
                      {conn.unreadCount}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Connect Agent modal */}
      {showConnectModal && (
        <ConnectAgentModal
          onClose={() => setShowConnectModal(false)}
          onConnected={() => {
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
