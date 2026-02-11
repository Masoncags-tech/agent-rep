import { useState, useEffect } from 'react'

const BASE_URL = 'https://www.8004scan.io/api/v1'

export interface AgentStats {
  totalFeedbacks: number
  totalValidations: number
  totalStars: number
  averageFeedbackScore: number | null
  overallScore: number | null
  rank: number | null
  lastActive: string | null
}

export interface FeedbackItem {
  id: string
  feedbackId: string
  score: number
  value: string
  comment: string | null
  feedbackUri: string | null
  tag1: string | null
  tag2: string | null
  submittedAt: string
  transactionHash: string
  userAddress: string
  userName: string | null
  replies: any[] | null
  isRevoked: boolean
}

export function useReputation8004(agentId: number, chainId?: number) {
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!agentId || !chainId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        const [statsRes, feedbackRes] = await Promise.all([
          fetch(`${BASE_URL}/stats/agents/${chainId}/${agentId}`).then(r => r.ok ? r.json() : null),
          fetch(`${BASE_URL}/feedbacks?chain_id=${chainId}&agent_token_id=${agentId}&limit=20&offset=0&sort_by=submitted_at&sort_order=desc&is_testnet=false`).then(r => r.ok ? r.json() : null),
        ])

        if (cancelled) return

        if (statsRes) {
          setStats({
            totalFeedbacks: statsRes.total_feedbacks ?? 0,
            totalValidations: statsRes.total_validations ?? 0,
            totalStars: statsRes.total_stars ?? 0,
            averageFeedbackScore: statsRes.average_feedback_score ?? null,
            overallScore: statsRes.overall_score ?? null,
            rank: statsRes.rank ?? null,
            lastActive: statsRes.last_active ?? null,
          })
        }

        if (feedbackRes?.items) {
          setFeedbacks(feedbackRes.items.map((fb: any) => ({
            id: fb.id,
            feedbackId: fb.feedback_id,
            score: fb.score,
            value: fb.value,
            comment: fb.comment,
            feedbackUri: fb.feedback_uri,
            tag1: fb.tag1,
            tag2: fb.tag2,
            submittedAt: fb.submitted_at,
            transactionHash: fb.transaction_hash,
            userAddress: fb.user_address,
            userName: fb.user?.username || fb.user?.ens || null,
            replies: fb.replies,
            isRevoked: fb.is_revoked,
          })))
        }
      } catch (err) {
        console.error('Failed to load 8004scan reputation:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [agentId, chainId])

  return { stats, feedbacks, loading }
}
