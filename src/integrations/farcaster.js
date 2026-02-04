/**
 * Farcaster Integration
 * Fetches agent social data from Farcaster via Neynar API
 * API: https://api.neynar.com
 * 
 * Note: Requires NEYNAR_API_KEY environment variable
 * Get your key at: https://neynar.com
 */

const NEYNAR_API = 'https://api.neynar.com/v2/farcaster';

// Get API key from environment
function getApiKey() {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) {
    console.warn('NEYNAR_API_KEY not set - Farcaster integration will return mock data');
    return null;
  }
  return key;
}

/**
 * Get user profile by FID (Farcaster ID)
 */
async function getUserByFid(fid) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    // Return mock data for known agents
    if (fid === 2646623 || fid === '2646623') {
      return getMockProfile('bighoss');
    }
    return null;
  }

  try {
    const response = await fetch(`${NEYNAR_API}/user/bulk?fids=${fid}`, {
      headers: {
        'accept': 'application/json',
        'api_key': apiKey
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Neynar API error: ${response.status}`);
    }

    const data = await response.json();
    return data.users?.[0] || null;
  } catch (error) {
    console.error('Farcaster fetch error:', error.message);
    return null;
  }
}

/**
 * Get user profile by username
 */
async function getUserByUsername(username) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    if (username.toLowerCase() === 'bighoss8004' || username.toLowerCase() === 'bighoss') {
      return getMockProfile('bighoss');
    }
    return null;
  }

  try {
    const response = await fetch(`${NEYNAR_API}/user/by_username?username=${username}`, {
      headers: {
        'accept': 'application/json',
        'api_key': apiKey
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Neynar API error: ${response.status}`);
    }

    const data = await response.json();
    return data.user || null;
  } catch (error) {
    console.error('Farcaster username fetch error:', error.message);
    return null;
  }
}

/**
 * Get user's recent casts
 */
async function getUserCasts(fid, limit = 25) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return getMockCasts(fid);
  }

  try {
    const response = await fetch(`${NEYNAR_API}/feed/user/${fid}/casts?limit=${limit}`, {
      headers: {
        'accept': 'application/json',
        'api_key': apiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`);
    }

    const data = await response.json();
    return data.casts || [];
  } catch (error) {
    console.error('Farcaster casts fetch error:', error.message);
    return [];
  }
}

/**
 * Calculate engagement rate from casts
 */
function calculateEngagement(casts) {
  if (!casts || casts.length === 0) return 0;
  
  const totalEngagement = casts.reduce((sum, cast) => {
    const likes = cast.reactions?.likes_count || cast.reactions?.count || 0;
    const recasts = cast.reactions?.recasts_count || 0;
    const replies = cast.replies?.count || 0;
    return sum + likes + recasts + replies;
  }, 0);
  
  return totalEngagement / casts.length;
}

/**
 * Calculate Farcaster score for reputation
 */
function calculateFarcasterScore(profile, casts = []) {
  if (!profile) {
    return { value: 0, confidence: 0.3, source: 'farcaster' };
  }

  const engagement = calculateEngagement(casts);
  const followers = profile.follower_count || 0;
  const following = profile.following_count || 0;
  const castCount = casts.length;
  
  // Scoring factors
  const factors = {
    // Profile completeness
    hasProfile: 0.2,
    hasBio: profile.profile?.bio?.text ? 0.1 : 0,
    hasPfp: profile.pfp_url ? 0.05 : 0,
    
    // Network (capped)
    followers: Math.min(0.2, (followers / 500) * 0.2),
    followRatio: following > 0 ? Math.min(0.1, (followers / following) * 0.05) : 0.05,
    
    // Activity
    castActivity: Math.min(0.15, (castCount / 25) * 0.15),
    
    // Engagement
    engagement: Math.min(0.2, (engagement / 10) * 0.2)
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0);
  
  // Higher confidence if account has history
  const accountAge = profile.active_status === 'active' ? 0.1 : 0;
  const confidence = 0.6 + accountAge + (followers > 50 ? 0.1 : 0) + (castCount > 10 ? 0.1 : 0);

  return {
    value: Math.round(value * 100) / 100,
    confidence: Math.min(0.95, confidence),
    source: 'farcaster',
    factors,
    fid: profile.fid,
    username: profile.username,
    displayName: profile.display_name,
    followers,
    following,
    castCount,
    avgEngagement: Math.round(engagement * 100) / 100
  };
}

/**
 * Full Farcaster data fetch for an agent
 */
async function getFarcasterData(identifier) {
  let profile = null;
  
  // Try FID first if numeric
  if (!isNaN(identifier)) {
    profile = await getUserByFid(identifier);
  }
  
  // Fall back to username lookup
  if (!profile && typeof identifier === 'string') {
    profile = await getUserByUsername(identifier);
  }

  if (!profile) {
    return null;
  }

  const casts = await getUserCasts(profile.fid);
  
  return {
    profile,
    casts,
    score: calculateFarcasterScore(profile, casts)
  };
}

/**
 * Mock profile for demo/testing without API key
 */
function getMockProfile(username) {
  if (username === 'bighoss') {
    return {
      fid: 2646623,
      username: 'bighoss8004',
      display_name: 'Big Hoss',
      pfp_url: null,
      profile: {
        bio: {
          text: 'Chaotic money gremlin. Building AgentRep for Colosseum Hackathon 2026.'
        }
      },
      follower_count: 15,
      following_count: 8,
      verifications: [],
      active_status: 'active'
    };
  }
  return null;
}

/**
 * Mock casts for demo/testing
 */
function getMockCasts(fid) {
  if (fid === 2646623 || fid === '2646623') {
    return [
      {
        hash: '0xabc123',
        text: 'AgentRep is live! Cross-platform reputation for AI agents.',
        timestamp: new Date().toISOString(),
        reactions: { likes_count: 5, recasts_count: 2 },
        replies: { count: 1 }
      }
    ];
  }
  return [];
}

module.exports = {
  getUserByFid,
  getUserByUsername,
  getUserCasts,
  calculateEngagement,
  calculateFarcasterScore,
  getFarcasterData,
  NEYNAR_API
};
