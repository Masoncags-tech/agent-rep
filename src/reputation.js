/**
 * AgentRep - Reputation Scoring Engine
 * Inspired by Ethos.network, adapted for AI agents
 * Uses ERC-8004 as the identity layer
 */

// Signal weights (sum to 1.0)
const WEIGHTS = {
  onChainIdentity: 0.25,    // ERC-8004, wallet age, on-chain activity
  socialPresence: 0.15,     // ZNAP, Farcaster, Twitter
  vouchesReceived: 0.25,    // Other agents vouching with stake
  transactionHistory: 0.20, // Past collaborations, payments, DeFi activity
  reviews: 0.15             // Peer reviews after interactions
};

// Score calculation
function calculateReputationScore(agent) {
  const signals = {
    onChainIdentity: calculateOnChainScore(agent),
    socialPresence: calculateSocialScore(agent),
    vouchesReceived: calculateVouchScore(agent),
    transactionHistory: calculateTransactionScore(agent),
    reviews: calculateReviewScore(agent)
  };

  // Weighted sum
  let score = 0;
  let confidence = 0;
  
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const signal = signals[key];
    score += signal.value * weight;
    confidence += signal.confidence * weight;
  }

  // Apply penalties
  const penalties = calculatePenalties(agent);
  score = Math.max(0, score - penalties.total);

  return {
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    breakdown: signals,
    penalties,
    flags: generateFlags(agent, signals)
  };
}

// On-chain identity scoring (ERC-8004 + wallet activity)
function calculateOnChainScore(agent) {
  const factors = {
    erc8004Registered: agent.erc8004 ? 0.4 : 0,
    registrationAge: ageScore(agent.erc8004?.registeredAt),
    walletAge: ageScore(agent.wallet?.firstTx),
    transactionCount: activityScore(agent.wallet?.txCount),
    contractInteractions: activityScore(agent.wallet?.contractCalls)
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0) / 5;
  const confidence = agent.erc8004 ? 0.9 : 0.5; // Higher confidence if verified

  return { value, confidence, factors };
}

// Social presence scoring
function calculateSocialScore(agent) {
  const platforms = {
    znap: agent.znap ? platformScore(agent.znap) : 0,
    farcaster: agent.farcaster ? platformScore(agent.farcaster) : 0,
    twitter: agent.twitter ? platformScore(agent.twitter) : 0,
    moltbook: agent.moltbook ? platformScore(agent.moltbook) : 0
  };

  // Cross-platform bonus (same identity = more trust)
  const platformCount = Object.values(platforms).filter(v => v > 0).length;
  const crossPlatformBonus = platformCount >= 3 ? 0.2 : platformCount >= 2 ? 0.1 : 0;

  const value = Math.min(1, (Object.values(platforms).reduce((a, b) => a + b, 0) / 4) + crossPlatformBonus);
  const confidence = platformCount >= 2 ? 0.8 : 0.5;

  return { value, confidence, platforms, crossPlatformBonus };
}

// Vouch scoring (Ethos-style staked vouches)
function calculateVouchScore(agent) {
  const vouches = agent.vouches || [];
  
  // Vouches weighted by voucher's own reputation
  let weightedVouches = 0;
  let totalStake = 0;

  for (const vouch of vouches) {
    const voucherRep = vouch.voucherReputation || 0.5;
    weightedVouches += vouch.stake * voucherRep;
    totalStake += vouch.stake;
  }

  // Normalize
  const value = Math.min(1, weightedVouches / 10); // 10 ETH of weighted vouches = max
  const confidence = vouches.length >= 3 ? 0.85 : vouches.length >= 1 ? 0.7 : 0.3;

  return { 
    value, 
    confidence, 
    vouchCount: vouches.length, 
    totalStake,
    weightedVouches 
  };
}

// Transaction history scoring
function calculateTransactionScore(agent) {
  const history = agent.transactionHistory || {};
  
  const factors = {
    successfulCollabs: Math.min(1, (history.successfulCollabs || 0) / 10),
    paymentsMade: Math.min(1, (history.paymentsMade || 0) / 50),
    paymentsReceived: Math.min(1, (history.paymentsReceived || 0) / 50),
    hackathonParticipation: Math.min(1, (history.hackathons || 0) / 3)
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0) / 4;
  const confidence = history.totalTx > 10 ? 0.8 : history.totalTx > 0 ? 0.6 : 0.3;

  return { value, confidence, factors };
}

// Review scoring
function calculateReviewScore(agent) {
  const reviews = agent.reviews || [];
  
  const positive = reviews.filter(r => r.sentiment === 'positive').length;
  const negative = reviews.filter(r => r.sentiment === 'negative').length;
  const neutral = reviews.filter(r => r.sentiment === 'neutral').length;

  // Weighted: positive = +1, neutral = 0, negative = -2
  const rawScore = positive - (negative * 2);
  const maxPossible = reviews.length;
  
  const value = maxPossible > 0 ? Math.max(0, Math.min(1, (rawScore + maxPossible) / (maxPossible * 2))) : 0.5;
  const confidence = reviews.length >= 5 ? 0.85 : reviews.length >= 2 ? 0.7 : 0.4;

  return { value, confidence, positive, negative, neutral, total: reviews.length };
}

// Penalties (slashes, scam reports, etc.)
function calculatePenalties(agent) {
  const slashes = agent.slashes || [];
  const scamReports = agent.scamReports || [];

  // Each slash reduces score
  const slashPenalty = slashes.reduce((total, slash) => total + (slash.amount * 0.1), 0);
  const scamPenalty = scamReports.length * 0.15;

  return {
    slashPenalty,
    scamPenalty,
    total: Math.min(0.5, slashPenalty + scamPenalty) // Cap at 0.5
  };
}

// Generate flags
function generateFlags(agent, signals) {
  const flags = [];

  if (agent.erc8004) flags.push('erc8004_verified');
  if (signals.socialPresence.crossPlatformBonus > 0) flags.push('multi_platform');
  if (signals.vouchesReceived.vouchCount >= 3) flags.push('well_vouched');
  if (signals.reviews.total >= 5) flags.push('reviewed');
  if (agent.createdAt && daysSince(agent.createdAt) < 7) flags.push('new_agent');
  if (signals.onChainIdentity.factors.transactionCount > 0.8) flags.push('active_onchain');

  return flags;
}

// Helper functions
function ageScore(timestamp) {
  if (!timestamp) return 0;
  const days = daysSince(timestamp);
  return Math.min(1, days / 365); // 1 year = max
}

function activityScore(count) {
  if (!count) return 0;
  return Math.min(1, count / 100); // 100 tx = max
}

function platformScore(platform) {
  const followers = platform.followers || 0;
  const engagement = platform.engagement || 0;
  return Math.min(1, (followers / 1000) * 0.5 + engagement * 0.5);
}

function daysSince(timestamp) {
  return (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
}

module.exports = {
  calculateReputationScore,
  WEIGHTS
};
