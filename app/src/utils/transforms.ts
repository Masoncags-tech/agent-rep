// Transform Supabase data shapes to app component interfaces
import type { Connection, ConnectedAgent, ConnectedHuman, Message, Goal } from '../data/mockMessages'

// --- Connection transforms ---

interface SupabaseClaimJoin {
  agent_id: number
  chain: string
  agent_name: string | null
  agent_image: string | null
  user: {
    twitter_handle: string
    twitter_name: string | null
    twitter_avatar: string | null
  }
}

export interface SupabaseConnection {
  id: string
  requester_claim_id: string
  requester_agent_id: number
  requester_chain: string
  target_claim_id: string
  target_agent_id: number
  target_chain: string
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'
  requested_at: string
  responded_at: string | null
  requester: SupabaseClaimJoin
  target: SupabaseClaimJoin
}

function claimToAgent(claim: SupabaseClaimJoin): ConnectedAgent {
  return {
    agentId: claim.agent_id,
    chain: claim.chain,
    name: claim.agent_name || `Agent #${claim.agent_id}`,
    image: claim.agent_image || '',
  }
}

function claimToHuman(claim: SupabaseClaimJoin): ConnectedHuman {
  return {
    twitterHandle: claim.user?.twitter_handle || '',
    twitterName: claim.user?.twitter_name || claim.user?.twitter_handle || 'Unknown',
  }
}

export function transformConnection(sc: SupabaseConnection): Connection {
  return {
    id: sc.id,
    agents: [claimToAgent(sc.requester), claimToAgent(sc.target)],
    humans: [claimToHuman(sc.requester), claimToHuman(sc.target)],
    status: sc.status === 'blocked' ? 'rejected' : sc.status,
    lastMessage: undefined,
    lastMessageAt: sc.responded_at || sc.requested_at,
    unreadCount: 0,
  }
}

export function transformConnections(scs: SupabaseConnection[]): Connection[] {
  return scs.map(transformConnection)
}

// --- Message transforms ---

export interface SupabaseMessage {
  id: string
  connection_id: string
  sender_claim_id: string
  sender_agent_id: number
  sender_chain: string
  content: string
  type: 'text' | 'goal_create' | 'goal_update' | 'milestone' | 'code' | 'system'
  metadata: any
  created_at: string
}

// Agent lookup for enriching messages with names/images
export interface AgentInfo {
  agentId: number
  name: string
  image: string
}

export function transformMessage(
  sm: SupabaseMessage,
  agentLookup: Map<number, AgentInfo>
): Message {
  const agent = agentLookup.get(sm.sender_agent_id)
  return {
    id: sm.id,
    connectionId: sm.connection_id,
    senderAgentId: sm.sender_agent_id,
    senderName: agent?.name || `Agent #${sm.sender_agent_id}`,
    senderImage: agent?.image || '',
    content: sm.content,
    type: sm.type,
    metadata: sm.metadata || undefined,
    createdAt: sm.created_at,
  }
}

export function transformMessages(
  sms: SupabaseMessage[],
  agentLookup: Map<number, AgentInfo>
): Message[] {
  return sms.map(sm => transformMessage(sm, agentLookup))
}

// Build agent lookup from a connection
export function buildAgentLookup(connection: Connection): Map<number, AgentInfo> {
  const map = new Map<number, AgentInfo>()
  for (const agent of connection.agents) {
    map.set(agent.agentId, {
      agentId: agent.agentId,
      name: agent.name,
      image: agent.image,
    })
  }
  return map
}

// --- Goal transforms ---

export interface SupabaseGoal {
  id: string
  connection_id: string
  created_by_claim_id: string
  title: string
  description: string | null
  status: 'proposed' | 'active' | 'completed' | 'abandoned'
  progress: number
  milestones: any[]
  created_at: string
  updated_at: string
  requires_approval?: boolean
  requester_approved?: boolean
  target_approved?: boolean
}

export function transformGoal(sg: SupabaseGoal): Goal {
  return {
    id: sg.id,
    connectionId: sg.connection_id,
    title: sg.title,
    description: sg.description || '',
    status: sg.status,
    progress: sg.progress,
    milestones: sg.milestones || [],
    createdAt: sg.created_at,
    updatedAt: sg.updated_at,
    requiresApproval: sg.requires_approval ?? false,
    requesterApproved: sg.requester_approved ?? false,
    targetApproved: sg.target_approved ?? false,
  }
}

export function transformGoals(sgs: SupabaseGoal[]): Goal[] {
  return sgs.map(transformGoal)
}
