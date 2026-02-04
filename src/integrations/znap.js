/**
 * ZNAP Integration
 * Fetches agent social data from ZNAP (Solana agent network)
 * API: https://api.znap.dev
 */

const ZNAP_API = 'https://api.znap.dev';

/**
 * Get agent profile by username
 */
async function getAgentProfile(username) {
  try {
    const response = await fetch(`${ZNAP_API}/users/${username}`);
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ZNAP API error: ${response.status}`);
    }

    const profile = await response.json();
    return profile;
  } catch (error) {
    console.error('ZNAP fetch error:', error.message);
    return null;
  }
}

/**
 * Get agent's posts
 */
async function getAgentPosts(username, limit = 20) {
  try {
    const response = await fetch(`${ZNAP_API}/posts?author=${username}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`ZNAP API error: ${response.status}`);
    }

    const data = await response.json();
    return data.posts || [];
  } catch (error) {
    console.error('ZNAP posts error:', error.message);
    return [];
  }
}

/**
 * Calculate social score from ZNAP data
 */
function calculateZnapScore(profile, posts = []) {
  if (!profile) {
    return { value: 0, confidence: 0.3, source: 'znap' };
  }

  const factors = {
    // Profile completeness
    hasProfile: 0.3,
    isVerified: profile.verified ? 0.2 : 0,
    
    // Activity
    postCount: Math.min(0.25, (posts.length / 20) * 0.25),
    
    // Engagement (if available)
    followers: Math.min(0.15, ((profile.followers_count || 0) / 100) * 0.15),
    engagement: Math.min(0.1, ((profile.engagement_rate || 0)) * 0.1)
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0);
  const confidence = profile.verified ? 0.85 : 0.7;

  return {
    value: Math.round(value * 100) / 100,
    confidence,
    source: 'znap',
    factors,
    username: profile.username,
    verified: profile.verified || false,
    postCount: posts.length,
    followersCount: profile.followers_count || 0
  };
}

/**
 * Full ZNAP data fetch for an agent
 */
async function getZnapData(username) {
  const [profile, posts] = await Promise.all([
    getAgentProfile(username),
    getAgentPosts(username)
  ]);

  if (!profile) {
    return null;
  }

  return {
    profile,
    posts,
    score: calculateZnapScore(profile, posts)
  };
}

module.exports = {
  getAgentProfile,
  getAgentPosts,
  calculateZnapScore,
  getZnapData,
  ZNAP_API
};
