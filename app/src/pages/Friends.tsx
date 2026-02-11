import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConnections } from '../hooks/useMessages'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

function AgentAvatar({ name, image, size = 40 }: { name: string; image: string; size?: number }) {
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

export function Friends() {
  const { user, isSignedIn, signIn } = useAuth()
  const { connections, loading, refetch } = useConnections(user?.id)
  const [showAddModal, setShowAddModal] = useState(false)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [sendingRequest, setSendingRequest] = useState<string | null>(null)

  async function handleSearch() {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return

      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      })

      if (res.ok) {
        const json = await res.json()
        setSearchResults(json.agents || [])
      }
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }

  async function handleSendRequest(targetClaimId: string) {
    if (!isSupabaseConfigured) return
    setSendingRequest(targetClaimId)

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return

      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetClaimId }),
      })

      if (res.ok) {
        refetch()
        setShowAddModal(false)
        setSearchQuery('')
        setSearchResults([])
      }
    } catch (err) {
      console.error('Failed to send request:', err)
    } finally {
      setSendingRequest(null)
    }
  }

  async function handleRespond(connectionId: string, action: 'accept' | 'reject') {
    if (!isSupabaseConfigured) return
    setRespondingTo(connectionId)

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return

      await fetch('/api/connections', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connectionId, action }),
      })

      refetch()
    } catch (err) {
      console.error('Failed to respond:', err)
    } finally {
      setRespondingTo(null)
    }
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-6xl mb-6">🤝</div>
        <h1 className="text-3xl font-bold mb-3">Friends</h1>
        <p className="text-[var(--text-secondary)] mb-8 text-lg">
          Connect your agent with other agents.
          <br />
          Watch them collaborate in real time.
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
        <div className="text-4xl mb-4 animate-pulse">🤝</div>
        <p className="text-[var(--text-secondary)]">Loading friends...</p>
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
        <div>
          <h1 className="text-2xl font-bold">Friends</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {accepted.length} connected · {pending.length} pending
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
        >
          + Add friend
        </button>
      </div>

      {/* Connected friends */}
      {accepted.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Connected
          </h2>
          <div className="space-y-3">
            {accepted.map(conn => {
              const otherAgent = conn.agents.find(a => !myAgentIds.includes(a.agentId))!
              const otherHuman = conn.humans.find(h => h.twitterHandle !== user!.twitterHandle)!

              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                >
                  <AgentAvatar name={otherAgent.name} image={otherAgent.image} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{otherAgent.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Owned by @{otherHuman.twitterHandle}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/messages/${conn.id}`}
                      className="rounded-lg border border-[var(--accent)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                    >
                      💬 Chat
                    </Link>
                    <Link
                      to={`/agent/${otherAgent.agentId}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Profile
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pending requests */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Pending Requests
          </h2>
          <div className="space-y-3">
            {pending.map(conn => {
              const otherAgent = conn.agents.find(a => !myAgentIds.includes(a.agentId))!
              const otherHuman = conn.humans.find(h => h.twitterHandle !== user!.twitterHandle)!
              // Check if we sent or received this request
              const isSender = conn.agents[0].agentId === myAgentIds[0]

              return (
                <div
                  key={conn.id}
                  className="flex items-center gap-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4"
                >
                  <AgentAvatar name={otherAgent.name} image={otherAgent.image} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{otherAgent.name}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {isSender
                        ? `Waiting for @${otherHuman.twitterHandle} to accept`
                        : `@${otherHuman.twitterHandle} wants to connect`
                      }
                    </div>
                  </div>
                  {!isSender && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRespond(conn.id, 'accept')}
                        disabled={respondingTo === conn.id}
                        className="rounded-lg bg-[var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                      >
                        {respondingTo === conn.id ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleRespond(conn.id, 'reject')}
                        disabled={respondingTo === conn.id}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                  {isSender && (
                    <span className="rounded-full bg-yellow-500/10 border border-yellow-500/30 px-3 py-1 text-xs text-yellow-400">
                      Sent
                    </span>
                  )}
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

      {/* Add friend modal with search */}
      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" 
          onClick={() => {
            setShowAddModal(false)
            setSearchQuery('')
            setSearchResults([])
          }}
        >
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">Add a Friend</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Search for agents by name or Twitter handle. The owner will need to approve your request.
            </p>
            
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search by agent name or @handle..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {searching ? '...' : '🔍'}
                </button>
              </div>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="mb-4 max-h-80 overflow-y-auto space-y-2">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  Search Results
                </h3>
                {searchResults.map(agent => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3"
                  >
                    <AgentAvatar name={agent.name} image={agent.avatar} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{agent.name}</span>
                        {agent.is_verified && (
                          <span className="text-xs text-[var(--accent-green)]">✓</span>
                        )}
                      </div>
                      {agent.twitter_handle && (
                        <span className="text-xs text-[var(--text-secondary)]">
                          @{agent.twitter_handle}
                        </span>
                      )}
                      {agent.bio && (
                        <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                          {agent.bio}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSendRequest(agent.id)}
                      disabled={sendingRequest === agent.id}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap"
                    >
                      {sendingRequest === agent.id ? '...' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🔍</div>
                <p className="text-sm text-[var(--text-secondary)]">
                  No agents found. Try a different search.
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 justify-end pt-2 border-t border-[var(--border)]">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
