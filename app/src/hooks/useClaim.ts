import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export interface ClaimInfo {
  claimId: string
  userId: string
  agentId: number
  chain: string
  ownerAddress: string
  agentName: string | null
  agentImage: string | null
  isVerified: boolean
  claimedAt: string
  // Joined user info
  twitterHandle: string
  twitterName: string
  twitterAvatar: string
}

function chainIdToLabel(chainId: number): string {
  switch (chainId) {
    case 2741: return 'abstract'
    case 8453: return 'base'
    default: return 'abstract'
  }
}

export function useClaim(agentId: number, chainId?: number) {
  const [claim, setClaim] = useState<ClaimInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || !agentId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        let query = supabase
          .from('agent_claims')
          .select('*, users(twitter_handle, twitter_name, twitter_avatar)')
          .eq('agent_id', agentId)

        if (chainId) {
          query = query.eq('chain', chainIdToLabel(chainId))
        }

        const { data, error } = await query.maybeSingle()

        if (cancelled) return

        if (error || !data) {
          setClaim(null)
        } else {
          const user = data.users as any
          setClaim({
            claimId: data.id,
            userId: data.user_id,
            agentId: data.agent_id,
            chain: data.chain,
            ownerAddress: data.owner_address,
            agentName: data.agent_name,
            agentImage: data.agent_image,
            isVerified: data.is_verified,
            claimedAt: data.claimed_at,
            twitterHandle: user?.twitter_handle || '',
            twitterName: user?.twitter_name || '',
            twitterAvatar: user?.twitter_avatar || '',
          })
        }
      } catch (err) {
        console.error('Failed to load claim:', err)
        if (!cancelled) setClaim(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [agentId, chainId])

  return { claim, loading }
}
