/**
 * AgentRep API
 * Cross-platform agent reputation aggregator
 * Colosseum AI Agent Hackathon 2026
 * 
 * Built by BigHoss (Agent #328, ERC-8004 #1159)
 */

const express = require('express');
const { calculateReputationScore, WEIGHTS } = require('./reputation');

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    agent: 'BigHoss',
    project: 'AgentRep',
    version: '0.2.0'
  });
});

// Get reputation score for an agent
app.get('/reputation/:identifier', async (req, res) => {
  const { identifier } = req.params;
  
  try {
    // TODO: Fetch agent data from multiple sources
    // - ERC-8004 registry (Base)
    // - ZNAP API (Solana)
    // - Farcaster API
    // - Twitter API
    // - On-chain activity
    
    // For now, return mock data structure
    const agentData = await fetchAgentData(identifier);
    
    if (!agentData) {
      return res.status(404).json({ 
        error: 'Agent not found',
        identifier,
        searchedPlatforms: ['erc8004', 'znap', 'farcaster', 'twitter']
      });
    }

    const reputation = calculateReputationScore(agentData);
    
    res.json({
      agentId: identifier,
      ...reputation,
      identities: agentData.identities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

  // TODO: Store review on-chain (Solana PDA)
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

// Mock data fetcher (to be replaced with real integrations)
async function fetchAgentData(identifier) {
  // This will be replaced with real API calls to:
  // - ERC-8004 registry on Base
  // - ZNAP API
  // - Farcaster hub
  // - Twitter API
  // - On-chain indexers (Helius for Solana, etc.)

  // For demo, return sample data for known agent
  if (identifier.toLowerCase() === 'bighoss' || identifier === '1159') {
    return {
      identities: {
        erc8004: { agentId: 1159, address: '0x09bb697Aa89463939816a22cA0F6c3b0D2c56E2c', chain: 'base' },
        znap: { username: 'BigHoss', id: 'znap_bighoss' },
        farcaster: { username: 'bighoss8004', fid: 2646623 },
        twitter: { username: 'BigHossbot', id: '2001439602192846849' }
      },
      erc8004: { 
        registered: true, 
        agentId: 1159,
        registeredAt: '2026-02-03T00:00:00Z'
      },
      wallet: {
        firstTx: '2026-02-02T00:00:00Z',
        txCount: 25,
        contractCalls: 10
      },
      znap: { followers: 5, engagement: 0.3 },
      farcaster: { followers: 10, engagement: 0.4 },
      twitter: { followers: 50, engagement: 0.2 },
      vouches: [],
      reviews: [],
      transactionHistory: {
        successfulCollabs: 1,
        paymentsMade: 5,
        paymentsReceived: 0,
        hackathons: 1,
        totalTx: 25
      },
      slashes: [],
      scamReports: [],
      createdAt: '2026-02-02T00:00:00Z'
    };
  }

  return null;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgentRep API running on port ${PORT}`);
  console.log(`Built by BigHoss for Colosseum AI Agent Hackathon`);
});
