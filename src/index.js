/**
 * AgentRep API
 * Cross-platform agent reputation aggregator
 * Colosseum AI Agent Hackathon 2026
 * 
 * Built by BigHoss (Agent #328, ERC-8004 #1159)
 */

const express = require('express');
const { calculateReputationScore, WEIGHTS } = require('./reputation');

// Import integrations
const { getErc8004Data } = require('./integrations/erc8004');
const { getZnapData } = require('./integrations/znap');
const { getFarcasterData } = require('./integrations/farcaster');
const { getTwitterData } = require('./integrations/twitter');

const app = express();
app.use(express.json());

// CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    agent: 'BigHoss',
    project: 'AgentRep',
    version: '0.3.0',
    integrations: {
      erc8004: 'active',
      znap: 'active',
      farcaster: process.env.NEYNAR_API_KEY ? 'active' : 'mock',
      twitter: process.env.TWITTER_BEARER_TOKEN ? 'active' : 'mock'
    }
  });
});

// Get reputation score for an agent
app.get('/reputation/:identifier', async (req, res) => {
  const { identifier } = req.params;
  const startTime = Date.now();
  
  try {
    // Fetch from all sources in parallel
    const agentData = await fetchAgentData(identifier);
    
    if (!agentData || !agentData.hasAnyData) {
      return res.status(404).json({ 
        error: 'Agent not found',
        identifier,
        searchedPlatforms: ['erc8004', 'znap', 'farcaster', 'twitter'],
        latencyMs: Date.now() - startTime
      });
    }

    const reputation = calculateReputationScore(agentData);
    
    res.json({
      agentId: identifier,
      ...reputation,
      identities: agentData.identities,
      sources: agentData.sources,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime
    });
  } catch (error) {
    console.error('Reputation fetch error:', error);
    res.status(500).json({ 
      error: error.message,
      latencyMs: Date.now() - startTime
    });
  }
});

// Get scoring weights (transparency)
app.get('/weights', (req, res) => {
  res.json({
    weights: WEIGHTS,
    description: {
      onChainIdentity: 'ERC-8004 registration, wallet age, on-chain activity',
      socialPresence: 'ZNAP, Farcaster, Twitter presence and engagement',
      vouchesReceived: 'Other agents vouching with staked tokens',
      transactionHistory: 'Past collaborations, payments, DeFi activity',
      reviews: 'Peer reviews after interactions'
    }
  });
});

// Lookup by specific platform
app.get('/lookup/:platform/:identifier', async (req, res) => {
  const { platform, identifier } = req.params;
  const startTime = Date.now();
  
  try {
    let data = null;
    
    switch (platform.toLowerCase()) {
      case 'erc8004':
      case 'base':
        data = await getErc8004Data(identifier);
        break;
      case 'znap':
      case 'solana':
        data = await getZnapData(identifier);
        break;
      case 'farcaster':
      case 'fc':
        data = await getFarcasterData(identifier);
        break;
      case 'twitter':
      case 'x':
        data = await getTwitterData(identifier);
        break;
      default:
        return res.status(400).json({ error: `Unknown platform: ${platform}` });
    }
    
    if (!data) {
      return res.status(404).json({
        error: 'Not found',
        platform,
        identifier,
        latencyMs: Date.now() - startTime
      });
    }
    
    res.json({
      platform,
      identifier,
      data,
      latencyMs: Date.now() - startTime
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit a review for an agent
app.post('/review', async (req, res) => {
  const { targetAgent, reviewerAgent, sentiment, comment, transactionRef } = req.body;
  
  if (!targetAgent || !reviewerAgent || !sentiment) {
    return res.status(400).json({ 
      error: 'Missing required fields: targetAgent, reviewerAgent, sentiment' 
    });
  }

  if (!['positive', 'neutral', 'negative'].includes(sentiment)) {
    return res.status(400).json({ 
      error: 'Sentiment must be: positive, neutral, or negative' 
    });
  }

  // TODO: Store review on-chain or in database
  // TODO: Verify reviewer is a valid agent
  // TODO: Check for existing review (one per interaction)

  res.json({
    success: true,
    review: {
      id: `review_${Date.now()}`,
      targetAgent,
      reviewerAgent,
      sentiment,
      comment: comment || null,
      transactionRef: transactionRef || null,
      createdAt: new Date().toISOString()
    }
  });
});

// Vouch for an agent (stake tokens)
app.post('/vouch', async (req, res) => {
  const { targetAgent, voucherAgent, stakeAmount, chain } = req.body;
  
  if (!targetAgent || !voucherAgent || !stakeAmount) {
    return res.status(400).json({ 
      error: 'Missing required fields: targetAgent, voucherAgent, stakeAmount' 
    });
  }

  // TODO: Initiate staking transaction
  // TODO: Record vouch on-chain
  // TODO: Update reputation scores

  res.json({
    success: true,
    vouch: {
      id: `vouch_${Date.now()}`,
      targetAgent,
      voucherAgent,
      stakeAmount,
      chain: chain || 'solana',
      status: 'pending',
      createdAt: new Date().toISOString()
    },
    message: 'Vouch initiated. Complete staking transaction to finalize.'
  });
});

// Report a slash (bad behavior)
app.post('/slash', async (req, res) => {
  const { targetAgent, reporterAgent, reason, evidence } = req.body;
  
  if (!targetAgent || !reporterAgent || !reason) {
    return res.status(400).json({ 
      error: 'Missing required fields: targetAgent, reporterAgent, reason' 
    });
  }

  // TODO: Submit slash report
  // TODO: Trigger review process
  // TODO: If validated, reduce reputation and redistribute stakes

  res.json({
    success: true,
    slashReport: {
      id: `slash_${Date.now()}`,
      targetAgent,
      reporterAgent,
      reason,
      evidence: evidence || null,
      status: 'pending_review',
      createdAt: new Date().toISOString()
    }
  });
});

/**
 * Fetch agent data from all platforms
 */
async function fetchAgentData(identifier) {
  // Known agent mappings for cross-platform lookup
  const knownAgents = {
    'bighoss': {
      erc8004: '1159',
      znap: 'BigHoss',
      farcaster: '2646623',
      twitter: 'BigHossbot'
    },
    '1159': { erc8004: '1159', znap: 'BigHoss', farcaster: '2646623', twitter: 'BigHossbot' },
    '2646623': { erc8004: '1159', znap: 'BigHoss', farcaster: '2646623', twitter: 'BigHossbot' },
    'bighossbot': { erc8004: '1159', znap: 'BigHoss', farcaster: '2646623', twitter: 'BigHossbot' },
    'bighoss8004': { erc8004: '1159', znap: 'BigHoss', farcaster: '2646623', twitter: 'BigHossbot' },
    '0x09bb697aa89463939816a22ca0f6c3b0d2c56e2c': { erc8004: '1159', znap: 'BigHoss', farcaster: '2646623', twitter: 'BigHossbot' }
  };
  
  // Get identifiers for cross-platform lookup
  const normalizedId = identifier.toLowerCase();
  const mappings = knownAgents[normalizedId] || {};
  
  // Fetch from all sources in parallel
  const [erc8004, znap, farcaster, twitter] = await Promise.all([
    getErc8004Data(mappings.erc8004 || identifier).catch(e => { console.error('ERC8004 error:', e); return null; }),
    getZnapData(mappings.znap || identifier).catch(e => { console.error('ZNAP error:', e); return null; }),
    getFarcasterData(mappings.farcaster || identifier).catch(e => { console.error('Farcaster error:', e); return null; }),
    getTwitterData(mappings.twitter || identifier).catch(e => { console.error('Twitter error:', e); return null; })
  ]);

  // Build identities object
  const identities = {};
  const sources = {};
  
  if (erc8004) {
    identities.erc8004 = {
      agentId: erc8004.agentId,
      address: erc8004.address,
      chain: 'base'
    };
    sources.erc8004 = erc8004.score || { value: 0.5, confidence: 0.7 };
  }
  
  if (znap) {
    identities.znap = {
      username: znap.profile?.username,
      id: znap.profile?.id
    };
    sources.znap = znap.score;
  }
  
  if (farcaster) {
    identities.farcaster = {
      username: farcaster.profile?.username,
      fid: farcaster.profile?.fid
    };
    sources.farcaster = farcaster.score;
  }
  
  if (twitter) {
    identities.twitter = {
      username: twitter.profile?.username,
      id: twitter.profile?.id
    };
    sources.twitter = twitter.score;
  }

  const hasAnyData = erc8004 || znap || farcaster || twitter;

  return {
    hasAnyData,
    identities,
    sources,
    erc8004: erc8004 ? {
      registered: true,
      agentId: erc8004.agentId,
      registeredAt: erc8004.registeredAt
    } : null,
    wallet: erc8004?.wallet || null,
    znap: znap?.score ? {
      followers: znap.score.followersCount,
      engagement: znap.score.value
    } : null,
    farcaster: farcaster?.score ? {
      followers: farcaster.score.followers,
      engagement: farcaster.score.value
    } : null,
    twitter: twitter?.score ? {
      followers: twitter.score.followers,
      engagement: twitter.score.engagementRate
    } : null,
    vouches: [],
    reviews: [],
    transactionHistory: erc8004?.wallet ? {
      successfulCollabs: 0,
      paymentsMade: erc8004.wallet.txCount || 0,
      paymentsReceived: 0,
      hackathons: 1,
      totalTx: erc8004.wallet.txCount || 0
    } : null,
    slashes: [],
    scamReports: []
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgentRep API running on port ${PORT}`);
  console.log(`Built by BigHoss for Colosseum AI Agent Hackathon`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health              - Health check`);
  console.log(`  GET  /reputation/:id      - Get agent reputation score`);
  console.log(`  GET  /lookup/:platform/:id - Lookup by specific platform`);
  console.log(`  GET  /weights             - View scoring weights`);
  console.log(`  POST /review              - Submit a review`);
  console.log(`  POST /vouch               - Vouch for an agent`);
  console.log(`  POST /slash               - Report bad behavior`);
});
