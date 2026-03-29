import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { AgentNode, GraphEdge, NetworkOverview } from '../types';

export function useNetworkOverview() {
  const [data, setData] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.graph.overview()
      .then((d) => setData(d as NetworkOverview))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useGraphData(communityFilter?: number) {
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nodesRes, edgesRes] = await Promise.all([
        api.graph.nodes({ limit: 1000, community_id: communityFilter }) as Promise<{ nodes: AgentNode[] }>,
        api.graph.edges({ limit: 5000, community_id: communityFilter }) as Promise<{ edges: GraphEdge[] }>,
      ]);
      setNodes(nodesRes.nodes);
      setEdges(edgesRes.edges);
    } catch (e) {
      setError((e as Error).message || 'Failed to load graph data');
    } finally {
      setLoading(false);
    }
  }, [communityFilter]);

  useEffect(() => { load(); }, [load]);

  return { nodes, edges, loading, error, reload: load };
}
