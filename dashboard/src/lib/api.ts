const BASE = '/api';

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'POST' });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  graph: {
    overview: () => get('/graph/overview'),
    nodes: (params?: { limit?: number; offset?: number; community_id?: number }) =>
      get('/graph/nodes', params as Record<string, number | undefined>),
    edges: (params?: { limit?: number; offset?: number; community_id?: number }) =>
      get('/graph/edges', params as Record<string, number | undefined>),
    subgraph: (community_id: number) => get(`/graph/subgraph/${community_id}`),
  },
  analysis: {
    centrality: (limit?: number) => get('/analysis/centrality', limit ? { limit } : undefined),
    communities: () => get('/analysis/communities'),
    gini: () => get('/analysis/gini'),
    runAll: () => post('/analysis/run/all'),
  },
  threats: {
    campaigns: (min_cluster_size?: number) =>
      get('/threats/campaigns', min_cluster_size ? { min_cluster_size } : undefined),
    anomalies: () => get('/threats/anomalies'),
    criticalNodes: (top_k?: number) => get('/threats/critical-nodes', top_k ? { top_k } : undefined),
    injectionPaths: (top_k?: number) => get('/threats/injection-paths', top_k ? { top_k } : undefined),
  },
  agents: {
    get: (id: string) => get(`/agents/${encodeURIComponent(id)}`),
    timeline: (id: string) => get(`/agents/${encodeURIComponent(id)}/timeline`),
  },
  search: (q: string, type?: string) => get('/search', { q, type }),
};
