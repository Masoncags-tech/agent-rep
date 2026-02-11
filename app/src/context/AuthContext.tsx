import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface User {
  id: string
  twitterHandle: string
  twitterName: string
  twitterAvatar: string
  claimedAgents: ClaimedAgent[]
}

export interface ClaimedAgent {
  agentId: number
  chain: string
  name: string
  image: string
  claimId?: string
}

interface AuthContextType {
  user: User | null
  isSignedIn: boolean
  isLoading: boolean
  signIn: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isSignedIn: false,
  isLoading: true,
  signIn: () => {},
  signOut: () => {},
})

// Mock user for demo when Supabase isn't configured
const MOCK_USER: User = {
  id: 'mock-mason',
  twitterHandle: 'masoncags',
  twitterName: 'Mason',
  twitterAvatar: '',
  claimedAgents: [
    {
      agentId: 592,
      chain: 'abstract',
      name: 'Big Hoss',
      image: '/agents/592.jpg',
    },
  ],
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    // Check for existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user)
      }
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user)
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserProfile(authUser: any) {
    try {
      // Get or create our app user record
      const twitterMeta = authUser.user_metadata
      const twitterId = twitterMeta?.provider_id || twitterMeta?.sub || authUser.id
      const handle = twitterMeta?.preferred_username || twitterMeta?.user_name || ''
      const name = twitterMeta?.full_name || twitterMeta?.name || handle
      const avatar = twitterMeta?.avatar_url || twitterMeta?.picture || ''

      // Upsert user in our users table
      await supabase
        .from('users')
        .upsert({
          id: authUser.id,
          twitter_id: twitterId,
          twitter_handle: handle,
          twitter_name: name,
          twitter_avatar: avatar,
        }, { onConflict: 'id' })
        .select()
        .single()

      // Fetch claimed agents
      const { data: claims } = await supabase
        .from('agent_claims')
        .select('*')
        .eq('user_id', authUser.id)

      setUser({
        id: authUser.id,
        twitterHandle: handle,
        twitterName: name,
        twitterAvatar: avatar,
        claimedAgents: (claims || []).map((c: any) => ({
          agentId: c.agent_id,
          chain: c.chain,
          name: c.agent_name || `Agent #${c.agent_id}`,
          image: c.agent_image || '',
          claimId: c.id,
        })),
      })
    } catch (err) {
      console.error('Failed to load user profile:', err)
    }
  }

  const signIn = async () => {
    if (!isSupabaseConfigured) {
      // Use mock user when Supabase isn't set up
      setUser(MOCK_USER)
      return
    }

    // X/Twitter OAuth 2.0 via Supabase
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'x' as any,
      options: {
        redirectTo: window.location.origin + '/messages',
      },
    })

    if (error) {
      console.error('Sign in error:', error)
    }
  }

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut()
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isSignedIn: !!user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
