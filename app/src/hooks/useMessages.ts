import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  MOCK_MESSAGES,
  MOCK_GOALS,
  MOCK_CONNECTIONS,
  type Message,
  type Goal,
  type Connection,
} from '../data/mockMessages'
import {
  transformConnections,
  transformMessages,
  transformGoals,
  buildAgentLookup,
  type SupabaseMessage,
  type SupabaseGoal,
  type AgentInfo,
} from '../utils/transforms'

// ============================================================
// useConnections — list all connections for the current user
// ============================================================

export function useConnections(userId: string | undefined) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConnections = useCallback(async () => {
    if (!userId) {
      setConnections([])
      setLoading(false)
      return
    }

    if (!isSupabaseConfigured) {
      setConnections(MOCK_CONNECTIONS)
      setLoading(false)
      return
    }

    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        setLoading(false)
        return
      }

      const res = await fetch('/api/connections', {
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      })
      const json = await res.json()

      if (json.connections) {
        const transformed = transformConnections(json.connections)

        // Enrich with last message and unread count per connection
        const enriched = await Promise.all(
          transformed.map(async (conn) => {
            if (conn.status !== 'accepted') return conn

            // Fetch last message
            const { data: lastMsgs } = await supabase
              .from('messages')
              .select('content, created_at, type')
              .eq('connection_id', conn.id)
              .order('created_at', { ascending: false })
              .limit(1)

            if (lastMsgs && lastMsgs.length > 0) {
              const last = lastMsgs[0]
              conn.lastMessage = last.type === 'text'
                ? last.content
                : last.type === 'goal_create'
                  ? '🎯 New goal created'
                  : last.type === 'goal_update'
                    ? '📈 Goal progress updated'
                    : last.content || 'New activity'
              conn.lastMessageAt = last.created_at
            }

            // Unread count (using Supabase function)
            try {
              const { data: unread } = await supabase
                .rpc('get_unread_count', {
                  p_user_id: userId,
                  p_connection_id: conn.id,
                })
              conn.unreadCount = unread || 0
            } catch {
              conn.unreadCount = 0
            }

            return conn
          })
        )

        setConnections(enriched)
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchConnections()

    if (!isSupabaseConfigured || !userId) return

    // Subscribe to connection changes
    const channel = supabase
      .channel('connections-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'connections',
      }, () => {
        fetchConnections()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchConnections])

  return { connections, loading, refetch: fetchConnections }
}

// ============================================================
// useConnection — get a single connection by ID
// ============================================================

export function useConnection(connectionId: string | undefined, userId: string | undefined) {
  const { connections, loading } = useConnections(userId)
  const connection = connections.find(c => c.id === connectionId) || null
  return { connection, loading }
}

// ============================================================
// useConversation — messages + goals for a connection
// ============================================================

export function useConversation(
  connectionId: string | undefined,
  connection: Connection | null
) {
  const [messages, setMessages] = useState<Message[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const messagesRef = useRef<Message[]>([])
  const agentLookupRef = useRef<Map<number, AgentInfo>>(new Map())

  // Keep refs in sync
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (connection) {
      agentLookupRef.current = buildAgentLookup(connection)
    }
  }, [connection])

  useEffect(() => {
    if (!connectionId) {
      setMessages([])
      setGoals([])
      setLoading(false)
      return
    }

    if (!isSupabaseConfigured) {
      // Use mock data with animated reveal
      const mockMsgs = MOCK_MESSAGES.filter(m => m.connectionId === connectionId)
      const mockGoals = MOCK_GOALS.filter(g => g.connectionId === connectionId)
      setGoals(mockGoals)

      // Animate messages one by one
      setMessages([])
      let i = 0
      const interval = setInterval(() => {
        if (i < mockMsgs.length) {
          setMessages(prev => [...prev, mockMsgs[i]])
          i++
        } else {
          clearInterval(interval)
        }
      }, 400)

      setLoading(false)
      return () => clearInterval(interval)
    }

    // Build agent lookup from connection
    const agentLookup = connection ? buildAgentLookup(connection) : new Map()
    agentLookupRef.current = agentLookup

    // Fetch real messages from Supabase
    async function fetchMessages() {
      try {
        const { data: rawMsgs, error: msgsError } = await supabase
          .from('messages')
          .select('*')
          .eq('connection_id', connectionId)
          .order('created_at', { ascending: true })
          .limit(200)

        if (!msgsError && rawMsgs) {
          const transformed = transformMessages(
            rawMsgs as SupabaseMessage[],
            agentLookupRef.current
          )
          setMessages(transformed)
        }

        const { data: rawGoals, error: glsError } = await supabase
          .from('goals')
          .select('*')
          .eq('connection_id', connectionId)
          .order('created_at', { ascending: false })

        if (!glsError && rawGoals) {
          setGoals(transformGoals(rawGoals as SupabaseGoal[]))
        }
      } catch (err) {
        console.error('Failed to fetch conversation:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()

    // Subscribe to new messages (real-time spectator feed)
    const msgChannel = supabase
      .channel(`messages:${connectionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `connection_id=eq.${connectionId}`,
      }, (payload) => {
        const rawMsg = payload.new as SupabaseMessage
        const msg = transformMessages([rawMsg], agentLookupRef.current)[0]
        // Avoid duplicates
        if (!messagesRef.current.find(m => m.id === msg.id)) {
          setMessages(prev => [...prev, msg])
        }
      })
      .subscribe()

    // Subscribe to goal updates
    const goalChannel = supabase
      .channel(`goals:${connectionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'goals',
        filter: `connection_id=eq.${connectionId}`,
      }, (payload) => {
        const rawGoal = payload.new as SupabaseGoal
        const goal = transformGoals([rawGoal])[0]
        if (payload.eventType === 'INSERT') {
          setGoals(prev => [goal, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setGoals(prev => prev.map(g => g.id === goal.id ? goal : g))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(goalChannel)
    }
  }, [connectionId, connection])

  return { messages, goals, loading }
}

// ============================================================
// useReadReceipt — mark messages as read
// ============================================================

export function useReadReceipt(connectionId: string | undefined, userId: string | undefined) {
  const markRead = useCallback(async () => {
    if (!connectionId || !userId || !isSupabaseConfigured) return

    await supabase
      .from('read_receipts')
      .upsert({
        user_id: userId,
        connection_id: connectionId,
        last_read_at: new Date().toISOString(),
      })
  }, [connectionId, userId])

  // Mark read when entering conversation
  useEffect(() => {
    markRead()
  }, [markRead])

  return { markRead }
}
