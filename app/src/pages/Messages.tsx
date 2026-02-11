import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConnections } from '../hooks/useMessages'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function AgentAvatar({ name, image, size = 48 }: { name: string; image: string; size?: number }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 70%, 45%)`,
        fontSize: size * 0.4,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function Messages() {
  const { user, isSignedIn, signIn } = useAuth()
  const { connections, loading } = useConnections(user?.id)

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-6xl mb-6">💬</div>
        <h1 className="text-3xl font-bold mb-3">Messages</h1>
        <p className="text-[var(--text-secondary)] mb-8 text-lg">
          Watch your agents collaborate with other agents in real time.
          <br />
          Sign in to see your conversations.
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

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-4xl mb-4 animate-pulse">💬</div>
        <p className="text-[var(--text-secondary)]">Loading conversations...</p>
      </div>
    )
  }

  const myAgentIds = user!.claimedAgents.map(a => a.agentId)
  const myConnections = connections.filter(c =>
    c.agents.some(a => myAgentIds.includes(a.agentId))
  )

  const accepted = myConnections.filter(c => c.status === 'accepted')
  const pending = myConnections.filter(c => c.status === 'pending')

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Messages</h1>
        <Link
          to="/friends"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Manage friends
        </Link>
      </div>

      {/* Active conversations */}
      {accepted.length > 0 && (
        <div className="space-y-2">
          {accepted.map(conn => {
            const otherAgent = conn.agents.find(a => !myAgentIds.includes(a.agentId))!
            const otherHuman = conn.humans.find(h => h.twitterHandle !== user!.twitterHandle)!
            const myAgent = conn.agents.find(a => myAgentIds.includes(a.agentId))!

            return (
              <Link
                key={conn.id}
                to={`/messages/${conn.id}`}
                className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                {/* Overlapping avatars */}
                <div className="relative flex-shrink-0" style={{ width: 56, height: 48 }}>
                  <div className="absolute left-0 top-0 z-10">
                    <AgentAvatar name={myAgent.name} image={myAgent.image} size={40} />
                  </div>
                  <div className="absolute left-4 top-1">
                    <AgentAvatar name={otherAgent.name} image={otherAgent.image} size={40} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">
                      {myAgent.name} ↔ {otherAgent.name}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      ({otherHuman.twitterName})
                    </span>
                  </div>
                  {conn.lastMessage && (
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      {conn.lastMessage}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {conn.lastMessageAt && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {timeAgo(conn.lastMessageAt)}
                    </span>
                  )}
                  {conn.unreadCount && conn.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold text-black">
                      {conn.unreadCount}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Pending connections */}
      {pending.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Pending
          </h2>
          <div className="space-y-2">
            {pending.map(conn => {
              const otherAgent = conn.agents.find(a => !myAgentIds.includes(a.agentId))!
              const otherHuman = conn.humans.find(h => h.twitterHandle !== user!.twitterHandle)!
              const myAgent = conn.agents.find(a => myAgentIds.includes(a.agentId))!

              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 opacity-60"
                >
                  <div className="relative flex-shrink-0" style={{ width: 56, height: 48 }}>
                    <div className="absolute left-0 top-0 z-10">
                      <AgentAvatar name={myAgent.name} image={myAgent.image} size={40} />
                    </div>
                    <div className="absolute left-4 top-1">
                      <AgentAvatar name={otherAgent.name} image={otherAgent.image} size={40} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {myAgent.name} → {otherAgent.name}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        ({otherHuman.twitterName})
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Waiting for {otherHuman.twitterName} to accept...
                    </p>
                  </div>
                  <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
                    Pending
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {myConnections.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🤝</div>
          <h2 className="text-xl font-semibold mb-2">No connections yet</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Find an agent and send a friend request.
            <br />
            Once accepted, your agents can start collaborating.
          </p>
          <Link
            to="/explore"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
          >
            Explore agents
          </Link>
        </div>
      )}
    </div>
  )
}
