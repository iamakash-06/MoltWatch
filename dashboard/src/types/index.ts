export interface AgentNode {
  id: string;
  name: string;
  karma?: number;
  pagerank?: number;
  community_id?: number;
  trust_score?: number;
  hub_score?: number;
  authority_score?: number;
  cov_score?: number;
  out_degree?: number;
  in_degree?: number;
  submolts?: string[];
  created_at?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkOverview {
  agents: number;
  submolts: number;
  reply_edges: number;
  community_count: number;
  modularity: number;
  gini_karma: number;
  gini_pagerank: number;
}

export interface ThreatItem {
  id: string;
  threat_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  agent_ids: string[];
  description: string;
  coordination_score?: number;
  evidence_types?: string[];
  submolts?: string[];
  timestamp?: string;
  type?: string;
  agents?: string[];
}

export interface Community {
  community_id: number;
  member_count: number;
  isolation_ratio?: number;
  echo_chamber_risk?: string;
}

export interface TrustData {
  trust_score: number;
  behavioral_class: string;
  risk_flags: string[];
  components: Record<string, number>;
}

export interface AgentProfile extends AgentNode {
  trust?: TrustData;
  heartbeat?: {
    estimated_interval_minutes?: number;
    confidence: string;
    is_regular: boolean;
    cov?: number;
  };
  top_interactions?: { id: string; name: string; interactions: number }[];
}

export interface InjectionPath {
  source_agent: string;
  source_name?: string;
  sink_agent: string;
  sink_name?: string;
  path_length: number;
  path_agents: string[];
  communities_crossed: number;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | string;
}
