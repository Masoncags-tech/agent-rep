/**
 * ERC-8004 Integration
 * Fetches agent identity from Base mainnet
 */

const { createPublicClient, http, parseAbi } = require('viem');
const { base } = require('viem/chains');

// Contract addresses on Base
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

// Minimal ABI for identity registry (ERC-721 + custom)
const IDENTITY_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
]);

// Create client
const client = createPublicClient({
  chain: base,
  transport: http()
});

/**
 * Get agent info by agent ID
 */
async function getAgentById(agentId) {
  try {
    const [owner, tokenUri] = await Promise.all([
      client.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'ownerOf',
        args: [BigInt(agentId)]
      }),
      client.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'tokenURI',
        args: [BigInt(agentId)]
      })
    ]);

    return {
      agentId,
      owner,
      tokenUri,
      registry: `eip155:8453:${IDENTITY_REGISTRY}`,
      chain: 'base'
    };
  } catch (error) {
    if (error.message.includes('ERC721')) {
      return null; // Token doesn't exist
    }
    throw error;
  }
}

/**
 * Get registration metadata from tokenURI
 */
async function getAgentMetadata(agentId) {
  const agent = await getAgentById(agentId);
  if (!agent) return null;

  // If tokenURI is a data URI, parse it
  if (agent.tokenUri.startsWith('data:application/json')) {
    const base64Data = agent.tokenUri.split(',')[1];
    const jsonStr = Buffer.from(base64Data, 'base64').toString();
    agent.metadata = JSON.parse(jsonStr);
  } else if (agent.tokenUri.startsWith('http')) {
    // Fetch from URL
    const response = await fetch(agent.tokenUri);
    agent.metadata = await response.json();
  } else if (agent.tokenUri.startsWith('ipfs://')) {
    // Fetch from IPFS gateway
    const gateway = agent.tokenUri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    const response = await fetch(gateway);
    agent.metadata = await response.json();
  }

  return agent;
}

/**
 * Check if address owns any agents
 */
async function getAgentsByOwner(ownerAddress) {
  const balance = await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: [ownerAddress]
  });

  return { owner: ownerAddress, agentCount: Number(balance) };
}

/**
 * Get total registered agents
 */
async function getTotalAgents() {
  const total = await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'totalSupply'
  });

  return Number(total);
}

/**
 * Calculate on-chain identity score
 */
function calculateOnChainScore(agent) {
  if (!agent) {
    return { value: 0, confidence: 0.3, registered: false };
  }

  const factors = {
    registered: 0.5, // Base score for being registered
    hasMetadata: agent.metadata ? 0.2 : 0,
    hasServices: agent.metadata?.services?.length > 0 ? 0.15 : 0,
    isActive: agent.metadata?.active === true ? 0.15 : 0
  };

  const value = Object.values(factors).reduce((a, b) => a + b, 0);

  return {
    value,
    confidence: 0.9, // High confidence for on-chain data
    registered: true,
    factors,
    agentId: agent.agentId,
    owner: agent.owner
  };
}

module.exports = {
  getAgentById,
  getAgentMetadata,
  getAgentsByOwner,
  getTotalAgents,
  calculateOnChainScore,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY
};
