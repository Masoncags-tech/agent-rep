import { useState, useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface Artifact {
  id: string
  title: string
  content: string
  type: 'markdown' | 'code' | 'text' | 'image'
  language?: string
  version: number
  status: 'draft' | 'review' | 'approved' | 'final'
  created_at: string
  updated_at: string
  creator?: { agent_name: string; agent_image: string }
  comments?: ArtifactComment[]
}

interface ArtifactComment {
  id: string
  content: string
  created_at: string
  user?: { twitter_handle: string; twitter_name: string }
}

interface WorkspacePanelProps {
  connectionId: string
  isOpen: boolean
  onToggle: () => void
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Draft' },
  review: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'In Review' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-400', label: 'Approved' },
  final: { bg: 'bg-[var(--accent)]/10', text: 'text-[var(--accent)]', label: 'Final' },
}

const typeIcons: Record<string, string> = {
  markdown: '📝',
  code: '💻',
  text: '📄',
  image: '🖼️',
}

function ArtifactCard({
  artifact,
  isExpanded,
  onToggle,
  onComment,
}: {
  artifact: Artifact
  isExpanded: boolean
  onToggle: () => void
  onComment: (artifactId: string, content: string) => void
}) {
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const status = statusColors[artifact.status] || statusColors.draft

  async function handleComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() || sending) return
    setSending(true)
    await onComment(artifact.id, commentText.trim())
    setCommentText('')
    setSending(false)
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden transition-all">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-primary)]/50 transition-colors text-left"
      >
        <span className="text-lg">{typeIcons[artifact.type] || '📄'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
              {artifact.title}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.bg} ${status.text}`}>
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[var(--text-secondary)]">
              by {artifact.creator?.agent_name || 'Unknown'}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">·</span>
            <span className="text-xs text-[var(--text-secondary)]">
              v{artifact.version}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">·</span>
            <span className="text-xs text-[var(--text-secondary)]">
              {timeAgo(artifact.updated_at)}
            </span>
          </div>
        </div>
        <span className={`text-[var(--text-secondary)] text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--border)]">
          {/* Content area */}
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {artifact.type === 'code' ? (
              <pre className="text-xs font-mono bg-[var(--bg-primary)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-[var(--text-primary)]">
                <code>{artifact.content}</code>
              </pre>
            ) : artifact.type === 'image' ? (
              <img
                src={artifact.content}
                alt={artifact.title}
                className="rounded-lg max-w-full"
              />
            ) : (
              <div className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {artifact.content}
              </div>
            )}
          </div>

          {/* Comments */}
          {artifact.comments && artifact.comments.length > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                💬 Comments ({artifact.comments.length})
              </span>
              {artifact.comments.map(c => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">
                    {c.user?.twitter_name || 'Unknown'}:
                  </span>
                  <span className="text-[var(--text-secondary)] flex-1">{c.content}</span>
                  <span className="text-[var(--text-secondary)] whitespace-nowrap">{timeAgo(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          <form
            onSubmit={handleComment}
            className="border-t border-[var(--border)] px-4 py-2 flex gap-2"
          >
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Leave feedback..."
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!commentText.trim() || sending}
              className="text-xs text-[var(--accent)] font-semibold disabled:opacity-30"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export function WorkspacePanel({ connectionId, isOpen, onToggle }: WorkspacePanelProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const artifactsRef = useRef<Artifact[]>([])
  const fetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => { artifactsRef.current = artifacts }, [artifacts])

  // Fetch artifacts
  useEffect(() => {
    if (!connectionId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }

    async function fetchArtifacts() {
      try {
        const { data: session } = await supabase.auth.getSession()
        if (!session?.session?.access_token) return

        const res = await fetch(`/api/artifacts?connectionId=${connectionId}`, {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        })
        const json = await res.json()
        if (json.artifacts) setArtifacts(json.artifacts)
      } catch (err) {
        console.error('Failed to fetch artifacts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRef.current = fetchArtifacts
    fetchArtifacts()

    // Real-time subscriptions (separate channels for reliability)
    const artifactChannel = supabase
      .channel(`ws-artifacts:${connectionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'artifacts',
        filter: `connection_id=eq.${connectionId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newArtifact = payload.new as Artifact
          if (!artifactsRef.current.find(a => a.id === newArtifact.id)) {
            setArtifacts(prev => [newArtifact, ...prev])
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Artifact
          setArtifacts(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
        }
      })
      .subscribe()

    const commentChannel = supabase
      .channel(`ws-comments:${connectionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'artifact_comments',
      }, () => {
        fetchArtifacts()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(artifactChannel)
      supabase.removeChannel(commentChannel)
    }
  }, [connectionId])

  async function handleComment(artifactId: string, content: string) {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) return

      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ action: 'comment', artifactId, content }),
      })

      // Re-fetch immediately so commenter sees their own comment
      if (res.ok) {
        await fetchRef.current()
      }
    } catch (err) {
      console.error('Comment failed:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]/80">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛠️</span>
          <span className="font-semibold text-sm">Workspace</span>
          {artifacts.length > 0 && (
            <span className="rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold px-2 py-0.5">
              {artifacts.length}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Artifacts list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="text-center py-8">
            <div className="text-2xl animate-pulse mb-2">🛠️</div>
            <p className="text-xs text-[var(--text-secondary)]">Loading workspace...</p>
          </div>
        ) : artifacts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-sm text-[var(--text-secondary)] mb-1">No artifacts yet</p>
            <p className="text-xs text-[var(--text-secondary)]">
              When agents produce drafts, outlines, or code, they'll appear here.
            </p>
          </div>
        ) : (
          artifacts.map(artifact => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              isExpanded={expandedId === artifact.id}
              onToggle={() => setExpandedId(prev => prev === artifact.id ? null : artifact.id)}
              onComment={handleComment}
            />
          ))
        )}
      </div>
    </div>
  )
}
