import { type Chain, defineChain } from 'viem'

export const abstractMainnet = defineChain({
  id: 2741,
  name: 'Abstract',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.mainnet.abs.xyz'] },
  },
  blockExplorers: {
    default: { name: 'AbsScan', url: 'https://abscan.org' },
  },
})

export const baseMainnet = defineChain({
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://base-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://basescan.org' },
  },
})

export interface ChainConfig {
  chain: Chain
  rpcUrl: string
  label: string
  emoji: string
  color: string
  // If set, scan events in chunks of this size (for RPCs with block range limits)
  logChunkSize?: number
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chain: abstractMainnet,
    rpcUrl: 'https://api.mainnet.abs.xyz',
    label: 'Abstract',
    emoji: '🔷',
    color: '#00d4ff',
  },
  {
    chain: baseMainnet,
    rpcUrl: 'https://base-rpc.publicnode.com',
    label: 'Base',
    emoji: '🔵',
    color: '#0052FF',
    logChunkSize: 50000,
  },
]
