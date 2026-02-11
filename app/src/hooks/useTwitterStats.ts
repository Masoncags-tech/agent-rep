import { useState, useEffect } from 'react'

export interface TwitterStats {
  username: string
  name: string
  profileImage: string
  followers: number
  tweets: number
  impressions: number
  likes: number
  replies: number
  retweets: number
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function useTwitterStats(username: string | undefined) {
  const [stats, setStats] = useState<TwitterStats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!username) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/twitter-stats?username=${encodeURIComponent(username!)}`) // eslint-disable-line
        if (!res.ok) throw new Error('Failed')
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch {
        // Silently fail - stats just won't show
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [username])

  return { stats, loading, formatNum }
}
