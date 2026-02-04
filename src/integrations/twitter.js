/**
 * Twitter Integration
 * Fetches agent social data from Twitter/X API
 * 
 * Uses Bearer token for read-only access
 * Requires TWITTER_BEARER_TOKEN environment variable
 */

const TWITTER_API = 'https://api.twitter.com/2';

// Get bearer token from environment
function getBearerToken() {
  const token = process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_BIGHOSS_BEARER;
  if (!token) {
    console.warn('TWITTER_BEARER_TOKEN not set - Twitter integration will return mock data');
    return null;
  }
  // Handle URL-encoded tokens
  return decodeURIComponent(token);
}

/**
 * Get user by username
 */
async function getUserByUsername(username) {
  const token = getBearerToken();
  
  if (!token) {
    if (username.toLowerCase() === 'bighossbot') {
      return getMockProfile('bighossbot');
    }
    return null;
  }

  try {
    const response = await fetch(
      `${TWITTER_API}/users/by/username/${username}?user.fields=public_metrics,description,created_at,verified_type`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) return null;
      console.error('Twitter API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Twitter fetch error:', error.message);
    return null;
  }
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const token = getBearerToken();
  
  if (!token) {
    if (userId === '2001439602192846849') {
      return getMockProfile('bighossbot');
    }
    return null;
  }

  try {
    const response = await fetch(
      `${TWITTER_API}/users/${userId}?user.fields=public_metrics,description,created_at,verified_type`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) return null;
      return null;
    }

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('Twitter ID fetch error:', error.message);
    return null;
  }
}

/**
 * Get user's recent tweets
 */
async function getUserTweets(userId, limit = 10) {
  const token = getBearerToken();
  
  if (!token) {
    return getMockTweets(userId);
  }

  try {
    const response = await fetch(
      `${TWITTER_API}/users/${userId}/tweets?max_results=${limit}&tweet.fields=public_metrics,created_at`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Twitter tweets fetch error:', error.message);
    return [];
  }
}

/**
 * Calculate engagement rate
 */
function calculateEngagement(profile, tweets = []) {
  if (!profile || !tweets.length) return 0;
  
  const followers = profile.public_metrics?.followers_count || 0;
  if (followers === 0) return 0;
  
  const totalEngagement = tweets.reduce((sum, tweet) => {
    const metrics = tweet.public_metrics || {};
    return sum + (metrics.like_count || 0) + (metrics.retweet_count || 0) + (metrics.reply_count || 0);
  }, 0);
  
  return (totalEngagement / tweets.length) / followers;
}

/**
 * Calculate Twitter score for reputation
 */
function calculateTwitterScore(profile, tweets = []) {
  if (!profile) {
    return { value: 0, confidence: 0.3, source: 'twitter' };
  }

  const metrics = profile.public_metrics || {};
  const followers = metrics.followers_count || 0;
  const following = metrics.following_count || 0;
  const tweetCount = metrics.tweet_count || 0;
  const engagement = calculateEngagement(profile, tweets);
  
  // Scoring factors
  const factors = {
    // Profile completeness
    hasProfile: 0.15,
    hasBio: profile.description ? 0.1 : 0,
    isVerified: profile.verified_type ? 0.15 : 0,
    
    // Network (logarithmic scaling)
    followers: Math.min(0.2, Math.log10(followers + 1) / 25),
    followRatio: following > 0 ? Math.min(0.1, (followers / following) * 0.05) : 0.05,
    
    // Activity
    tweetActivity: Math.min(0.15, Math.log10(tweetCount + 1) / 20),
    
    // Engagement
    engagement: Math.min(0.15, engagement * 100)
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0);
  
  // Account age contributes to confidence
  const createdAt = profile.created_at ? new Date(profile.created_at) : null;
  const accountAgeMonths = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30) : 0;
  const ageBonus = Math.min(0.2, accountAgeMonths / 24 * 0.2);
  
  const confidence = Math.min(0.95, 0.5 + ageBonus + (followers > 100 ? 0.1 : 0) + (tweetCount > 50 ? 0.1 : 0));

  return {
    value: Math.round(value * 100) / 100,
    confidence,
    source: 'twitter',
    factors,
    userId: profile.id,
    username: profile.username,
    displayName: profile.name,
    followers,
    following,
    tweetCount,
    engagementRate: Math.round(engagement * 10000) / 100 // As percentage
  };
}

/**
 * Full Twitter data fetch for an agent
 */
async function getTwitterData(identifier) {
  let profile = null;
  
  // Try user ID first if numeric
  if (!isNaN(identifier)) {
    profile = await getUserById(identifier);
  }
  
  // Fall back to username lookup
  if (!profile && typeof identifier === 'string') {
    // Remove @ if present
    const username = identifier.replace('@', '');
    profile = await getUserByUsername(username);
  }

  if (!profile) {
    return null;
  }

  const tweets = await getUserTweets(profile.id);
  
  return {
    profile,
    tweets,
    score: calculateTwitterScore(profile, tweets)
  };
}

/**
 * Mock profile for demo/testing
 */
function getMockProfile(username) {
  if (username.toLowerCase() === 'bighossbot') {
    return {
      id: '2001439602192846849',
      username: 'BigHossbot',
      name: 'Big Hoss 🤖',
      description: 'Chaotic money gremlin. AI agent on OpenClaw. Building reputation systems.',
      created_at: '2026-02-02T00:00:00.000Z',
      verified_type: null,
      public_metrics: {
        followers_count: 50,
        following_count: 25,
        tweet_count: 35,
        listed_count: 0
      }
    };
  }
  return null;
}

/**
 * Mock tweets for demo/testing
 */
function getMockTweets(userId) {
  if (userId === '2001439602192846849') {
    return [
      {
        id: '1',
        text: 'AgentEscrow contract ready for Base Sepolia!',
        created_at: new Date().toISOString(),
        public_metrics: {
          like_count: 5,
          retweet_count: 2,
          reply_count: 3
        }
      }
    ];
  }
  return [];
}

module.exports = {
  getUserByUsername,
  getUserById,
  getUserTweets,
  calculateEngagement,
  calculateTwitterScore,
  getTwitterData,
  TWITTER_API
};
