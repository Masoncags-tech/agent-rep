// Vercel serverless function: GET /api/twitter-stats?username=BigHossbot
// Returns real-time Twitter stats for an agent

export const config = { runtime: 'edge' }

const BEARER = process.env.TWITTER_BEARER_TOKEN

// Cache stats for 15 min to avoid rate limits
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 15 * 60 * 1000

export default async function handler(req: Request) {
  const url = new URL(req.url)
  const username = url.searchParams.get('username')

  if (!username) {
    return new Response(JSON.stringify({ error: 'username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Check cache
  const cached = cache.get(username)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (!BEARER) {
    return new Response(JSON.stringify({ error: 'API not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    // Get user profile
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics,profile_image_url,description`,
      { headers: { Authorization: `Bearer ${BEARER}` } }
    )
    const userData = await userRes.json()
    if (!userData.data) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const userId = userData.data.id
    const profile = userData.data.public_metrics

    // Get recent tweets for impression/like totals
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${BEARER}` } }
    )
    const tweetsData = await tweetsRes.json()

    let impressions = 0
    let likes = 0
    let replies = 0
    let retweets = 0

    for (const tweet of tweetsData.data || []) {
      const m = tweet.public_metrics
      impressions += m.impression_count || 0
      likes += m.like_count || 0
      replies += m.reply_count || 0
      retweets += m.retweet_count || 0
    }

    const result = {
      username: userData.data.username,
      name: userData.data.name,
      profileImage: userData.data.profile_image_url?.replace('_normal', '_400x400'),
      description: userData.data.description,
      followers: profile.followers_count,
      following: profile.following_count,
      tweets: profile.tweet_count,
      impressions,
      likes,
      replies,
      retweets,
      tweetsSampled: tweetsData.data?.length || 0,
      cachedAt: new Date().toISOString(),
    }

    cache.set(username, { data: result, ts: Date.now() })

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
