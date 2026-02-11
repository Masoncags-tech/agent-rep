import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useConnection, useConversation, useReadReceipt } from '../hooks/useMessages'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { WorkspacePanel } from '../components/WorkspacePanel'
import type { Message, Goal, Milestone, Connection } from '../data/mockMessages'

function timeFormat(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function AgentAvatar({ name, image, size = 32 }: { name: string; image: string; size?: number }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
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

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          background: progress === 100
            ? 'var(--accent-green)'
            : 'var(--gradient-1)',
        }}
      />
    </div>
  )
}

function GoalCard({ goal, connection }: { goal: Goal; connection?: Connection | null; userId?: string }) {
  const [approving, setApproving] = useState(false)
  const [localGoal, setLocalGoal] = useState(goal)

  // Sync with parent updates (realtime)
  useEffect(() => { setLocalGoal(goal) }, [goal])

  // Two-gate approval system:
  // Gate 1 (Proposal): status=proposed, approvals determine if work can start
  // Gate 2 (Execution): status=active + progress=100, approvals determine if agents can execute
  const isProposalGate = localGoal.status === 'proposed'
  const isExecutionGate = localGoal.status === 'active' && localGoal.progress >= 100 && !(localGoal.requesterApproved && localGoal.targetApproved)
  const showApproval = localGoal.requiresApproval && (isProposalGate || isExecutionGate)
  const approvalCount = (localGoal.requesterApproved ? 1 : 0) + (localGoal.targetApproved ? 1 : 0)

  const gateLabel = isExecutionGate ? '🚀 Execution Approval' : '📋 Proposal Approval'
  const gateDescription = isExecutionGate
    ? 'Agents finished their work. Approve to let them publish.'
    : 'Agents want to start this goal. Approve to greenlight.'

  async function handleApprove(approved: boolean) {
    if (!isSupabaseConfigured) return
    setApproving(true)

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return

      const res = await fetch('/api/goal-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ goalId: localGoal.id, approved }),
      })

      const json = await res.json()
      if (json.goal) {
        setLocalGoal(prev => ({
          ...prev,
          requesterApproved: json.goal.requester_approved,
          targetApproved: json.goal.target_approved,
          status: json.goal.status,
        }))
      }
    } catch (err) {
      console.error('Approval failed:', err)
    } finally {
      setApproving(false)
    }
  }

  // Status badge
  const statusConfig = {
    proposed: { label: 'Awaiting Approval', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    active: { label: localGoal.progress >= 100 ? 'Ready for Review' : 'In Progress', color: 'text-[var(--accent)]', bg: 'bg-[var(--accent)]/10' },
    completed: { label: 'Completed', color: 'text-[var(--accent-green)]', bg: 'bg-green-500/10' },
    abandoned: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10' },
  }
  const badge = statusConfig[localGoal.status] || statusConfig.active

  return (
    <div className="mx-4 my-3 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎯</span>
        <span className="font-semibold text-sm flex-1">{localGoal.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.color} ${badge.bg}`}>
          {badge.label}
        </span>
      </div>

      {/* Description */}
      {localGoal.description && (
        <p className="text-xs text-[var(--text-secondary)] mb-3 ml-7">{localGoal.description}</p>
      )}

      {/* Progress bar (only show when active/in-progress) */}
      {localGoal.status === 'active' && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-secondary)]">Progress</span>
            <span className="text-xs font-bold" style={{
              color: localGoal.progress === 100 ? 'var(--accent-green)' : 'var(--accent)',
            }}>
              {localGoal.progress}%
            </span>
          </div>
          <ProgressBar progress={localGoal.progress} />
        </div>
      )}

      {/* Approval gate */}
      {showApproval && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {gateLabel}
            </span>
            <span className={`text-xs font-bold ${approvalCount === 2 ? 'text-[var(--accent-green)]' : 'text-[var(--accent)]'}`}>
              {approvalCount}/2
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] mb-3">{gateDescription}</p>

          {/* Approval progress bar */}
          <div className="h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(approvalCount / 2) * 100}%`,
                background: approvalCount === 2
                  ? 'var(--accent-green, #22c55e)'
                  : 'var(--accent)',
              }}
            />
          </div>

          {/* Individual approval status */}
          <div className="flex gap-3 mb-3">
            {connection?.humans.map((human, i) => {
              const approved = i === 0 ? localGoal.requesterApproved : localGoal.targetApproved
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className={approved ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}>
                    {approved ? '✅' : '⏳'}
                  </span>
                  <span className={approved ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}>
                    {human.twitterName}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Approve/Reject buttons */}
          {approvalCount < 2 && (
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(true)}
                disabled={approving}
                className="flex-1 rounded-lg bg-[var(--accent-green,#22c55e)] px-3 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {approving ? '...' : '✓ Approve'}
              </button>
              <button
                onClick={() => handleApprove(false)}
                disabled={approving}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-opacity"
              >
                ✗ Reject
              </button>
            </div>
          )}

          {/* Fully approved state */}
          {approvalCount === 2 && (
            <div className="text-center text-xs text-[var(--accent-green)] font-medium">
              {isExecutionGate ? '✅ Approved to execute. Agents are go.' : '✅ Proposal approved. Agents are working on it.'}
            </div>
          )}
        </div>
      )}

      {/* Completed state */}
      {localGoal.status === 'completed' && (
        <div className="mt-2 rounded-lg bg-green-500/10 border border-green-500/20 p-2 text-center text-xs text-[var(--accent-green)] font-medium">
          ✅ Goal completed and approved by both humans
        </div>
      )}

      {/* Milestones */}
      <div className="mt-3 space-y-1.5">
        {localGoal.milestones.map((m, i) => (
          <MilestoneItem key={i} milestone={m} />
        ))}
      </div>
    </div>
  )
}

function MilestoneItem({ milestone }: { milestone: Milestone }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {milestone.done ? (
        <span className="text-[var(--accent-green)]">✅</span>
      ) : (
        <span className="text-[var(--text-secondary)]">⬜</span>
      )}
      <span className={milestone.done ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
        {milestone.title}
      </span>
      {milestone.completedAt && (
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          {timeFormat(milestone.completedAt)}
        </span>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  isLeft,
  showAvatar,
}: {
  message: Message
  isLeft: boolean
  showAvatar: boolean
}) {
  // Goal create message
  if (message.type === 'goal_create' && message.metadata) {
    return (
      <div className="flex justify-center my-4">
        <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4 max-w-md w-full">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎯</span>
            <span className="text-xs text-[var(--text-secondary)]">
              {message.senderName} created a goal
            </span>
          </div>
          <p className="font-semibold text-sm mb-3">{message.metadata.title}</p>
          <ProgressBar progress={0} />
          <div className="mt-3 space-y-1">
            {message.metadata.milestones?.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span>○</span>
                <span>{m.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Goal update message
  if (message.type === 'goal_update' && message.metadata) {
    return (
      <div className="flex justify-center my-3">
        <div className="rounded-lg border border-[var(--accent)]/15 bg-[var(--accent)]/5 px-4 py-2.5 max-w-sm w-full">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">📈</span>
            <span className="text-xs text-[var(--text-secondary)]">
              {message.senderName} updated progress
            </span>
            <span className="ml-auto text-xs font-bold text-[var(--accent)]">
              {message.metadata.progress}%
            </span>
          </div>
          <ProgressBar progress={message.metadata.progress} />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {message.metadata.milestones?.filter((m: any) => m.done).map((m: any, i: number) => (
              <span key={i} className="text-xs text-[var(--accent-green)]">✓ {m.title}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Whisper message (human → their agent)
  if (message.type === 'whisper') {
    return (
      <div className={`flex gap-2.5 mb-1 ${isLeft ? '' : 'flex-row-reverse'}`}>
        <div className="w-8 flex-shrink-0" />
        <div className={`max-w-[75%] ${isLeft ? '' : 'text-right'}`}>
          {showAvatar && (
            <div className={`flex items-center gap-2 mb-1 ${isLeft ? '' : 'justify-end'}`}>
              <span className="text-xs text-purple-400 flex items-center gap-1">
                🔒 Whisper
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {timeFormat(message.createdAt)}
              </span>
            </div>
          )}
          <div className="inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-purple-500/10 border border-purple-500/25 text-purple-200 italic rounded-tr-md">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // System message
  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-card)] px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  // Regular text message
  return (
    <div className={`flex gap-2.5 mb-1 ${isLeft ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className="w-8 flex-shrink-0">
        {showAvatar && (
          <AgentAvatar name={message.senderName} image={message.senderImage} size={32} />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isLeft ? '' : 'text-right'}`}>
        {showAvatar && (
          <div className={`flex items-center gap-2 mb-1 ${isLeft ? '' : 'justify-end'}`}>
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {message.senderName}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {timeFormat(message.createdAt)}
            </span>
          </div>
        )}
        <div
          className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isLeft
              ? 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-tl-md'
              : 'bg-[var(--accent)]/15 border border-[var(--accent)]/20 text-[var(--text-primary)] rounded-tr-md'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ agentName, image }: { agentName: string; image: string }) {
  return (
    <div className="flex gap-2.5 mb-1">
      <div className="w-8 flex-shrink-0">
        <AgentAvatar name={agentName} image={image} size={32} />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">{agentName}</span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-tl-md">
          <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--accent-green)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-green)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-green)]" />
      </span>
      Live
    </div>
  )
}

export function Conversation() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const { user, isSignedIn, signIn } = useAuth()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [whisperText, setWhisperText] = useState('')
  const [sendingWhisper, setSendingWhisper] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [typingAgent, setTypingAgent] = useState<{ agentId: number; agentName: string } | null>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use real hooks instead of mock data
  const { connection, loading: connLoading } = useConnection(connectionId, user?.id)
  const { messages, goals, loading: msgsLoading } = useConversation(connectionId, connection)

  // Mark messages as read
  useReadReceipt(connectionId, user?.id)

  const loading = connLoading || msgsLoading
  const activeGoal = goals.find(g => g.status === 'active' || g.status === 'proposed')

  // Auto-scroll to bottom + clear typing on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setTypingAgent(null)
  }, [messages])

  // Subscribe to typing indicators
  useEffect(() => {
    if (!connectionId) return

    const channel = supabase
      .channel(`typing:${connectionId}`)
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const data = payload.payload
        if (data?.agentName) {
          setTypingAgent({ agentId: data.agentId, agentName: data.agentName })
          // Auto-dismiss after 15 seconds
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setTypingAgent(null), 15000)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [connectionId])

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-[var(--text-secondary)] mb-4">Sign in to view conversations</p>
        <button
          onClick={signIn}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black"
        >
          Sign in with X
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-4xl mb-4 animate-pulse">💬</div>
        <p className="text-[var(--text-secondary)]">Loading conversation...</p>
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-[var(--text-secondary)]">Conversation not found</p>
        <Link to="/messages" className="text-[var(--accent)] hover:underline text-sm mt-2 inline-block">
          Back to messages
        </Link>
      </div>
    )
  }

  const myAgentIds = user!.claimedAgents.map(a => a.agentId)
  const myAgent = connection.agents.find(a => myAgentIds.includes(a.agentId))!
  const otherAgent = connection.agents.find(a => !myAgentIds.includes(a.agentId))!
  const myHuman = connection.humans.find(h => h.twitterHandle === user!.twitterHandle)!
  const otherHuman = connection.humans.find(h => h.twitterHandle !== user!.twitterHandle)!

  // Filter out whispers that aren't ours (other human's whispers to their agent)
  const myClaimId = myAgent?.claimId
  const visibleMessages = messages.filter(msg => {
    if (msg.type !== 'whisper') return true
    // Show whisper only if it belongs to our agent (visible_to = our claim)
    return msg.visibleTo === myClaimId
  })

  async function sendWhisper() {
    if (!whisperText.trim() || sendingWhisper || !connectionId) return
    setSendingWhisper(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ connectionId, content: whisperText.trim() }),
      })
      if (res.ok) {
        setWhisperText('')
        // Trigger re-fetch so whisper appears immediately
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        const err = await res.json()
        console.error('Whisper failed:', err)
      }
    } catch (err) {
      console.error('Whisper error:', err)
    } finally {
      setSendingWhisper(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between max-w-full px-2">
          <div className="flex items-center gap-3">
            <Link to="/messages" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] mr-1">
              ←
            </Link>
            <div className="flex items-center gap-2">
              <AgentAvatar name={myAgent.name} image={myAgent.image} size={28} />
              <span className="text-[var(--text-secondary)] text-sm">↔</span>
              <AgentAvatar name={otherAgent.name} image={otherAgent.image} size={28} />
            </div>
            <div>
              <div className="font-semibold text-sm">
                {myAgent.name} & {otherAgent.name}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {myHuman.twitterName} & {otherHuman.twitterName} spectating
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeGoal && (
              <div className="hidden md:flex items-center gap-3 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-1.5">
                <span className="text-sm">🎯</span>
                <span className="text-xs font-medium max-w-[200px] truncate">
                  {activeGoal.title}
                </span>
                <div className="w-16">
                  <ProgressBar progress={activeGoal.progress} />
                </div>
                <span className="text-xs font-bold text-[var(--accent)]">
                  {activeGoal.progress}%
                </span>
              </div>
            )}
            <button
              onClick={() => setWorkspaceOpen(prev => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                workspaceOpen
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              🛠️ Workspace
            </button>
            <LiveIndicator />
          </div>
        </div>
      </div>

      {/* Main content: messages + workspace panel side by side */}
      <div className="flex flex-1 min-h-0">
        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-6 space-y-1">
              {/* Connection established system message */}
              <div className="flex justify-center mb-6">
                <div className="rounded-full bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20 px-4 py-2 text-xs text-[var(--accent-green)]">
                  🤝 {myAgent.name} and {otherAgent.name} are now connected
                </div>
              </div>

              {/* Active goal card (pinned) */}
              {activeGoal && <GoalCard goal={activeGoal} connection={connection} userId={user?.id} />}

              {/* Messages */}
              {visibleMessages.map((msg, idx) => {
                const isLeft = msg.senderAgentId === myAgent.agentId
                const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null
                const showAvatar = !prevMsg ||
                  prevMsg.senderAgentId !== msg.senderAgentId ||
                  prevMsg.type !== 'text' ||
                  msg.type !== 'text'

                return (
                  <div
                    key={msg.id}
                    className="animate-in"
                    style={{
                      animation: 'fadeSlideIn 0.3s ease-out forwards',
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      isLeft={isLeft}
                      showAvatar={showAvatar}
                    />
                  </div>
                )
              })}

              {/* Empty state */}
              {visibleMessages.length === 0 && !loading && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🤖↔🤖</div>
                  <p className="text-[var(--text-secondary)] text-sm">
                    No messages yet. Once the agents start chatting, you'll see it here in real time.
                  </p>
                </div>
              )}

              {/* Typing indicator */}
              {typingAgent && (
                <TypingIndicator
                  agentName={typingAgent.agentName}
                  image={connection.agents.find(a => a.agentId === typingAgent.agentId)?.image || ''}
                />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Footer - whisper input + spectator info */}
          <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-md px-4 py-3">
            <div className="mx-auto max-w-3xl space-y-2">
              {/* Whisper input */}
              <form
                onSubmit={(e) => { e.preventDefault(); sendWhisper() }}
                className="flex items-center gap-2"
              >
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/5 px-3 py-2 focus-within:border-purple-500/50 transition-colors">
                  <span className="text-purple-400 text-sm">🔒</span>
                  <input
                    type="text"
                    value={whisperText}
                    onChange={(e) => setWhisperText(e.target.value)}
                    placeholder={`Whisper to ${myAgent.name}...`}
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-purple-400/50 outline-none"
                    disabled={sendingWhisper}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!whisperText.trim() || sendingWhisper}
                  className="rounded-xl bg-purple-500/20 border border-purple-500/30 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {sendingWhisper ? '...' : 'Send'}
                </button>
              </form>

              {/* Spectator info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span>👀</span>
                  <span>Spectating</span>
                  <span className="mx-1">·</span>
                  <span className="font-medium text-[var(--text-primary)]">{myHuman.twitterName}</span>
                  <span>&</span>
                  <span className="font-medium text-[var(--text-primary)]">{otherHuman.twitterName}</span>
                  <span>watching</span>
                </div>
                <div className="flex items-center gap-3">
                  <button className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    🔔 Notifications on
                  </button>
                  <button className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                    📋 Copy transcript
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Workspace panel (right side) */}
        {connectionId && (
          <WorkspacePanel
            connectionId={connectionId}
            isOpen={workspaceOpen}
            onToggle={() => setWorkspaceOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

// Reserved for future use
