import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Community, InjectionPath, ThreatItem } from '../types';

export function useThreats(pollMs = 30000) {
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const [anomalies, setAnomalies] = useState<ThreatItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [campaignsRes, anomaliesRes] = await Promise.all([
        api.threats.campaigns() as Promise<{ campaigns: ThreatItem[] }>,
        api.threats.anomalies() as Promise<{ anomalies: ThreatItem[] }>,
      ]);
      setThreats(campaignsRes.campaigns || []);
      setAnomalies(anomaliesRes.anomalies || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, pollMs);
    return () => clearInterval(interval);
  }, [pollMs]);

  return { threats, anomalies, loading, reload: load };
}

export function useCommunities() {
  const [data, setData] = useState<{ communities: Community[]; modularity: number; echo_chambers: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.analysis.communities()
      .then((d) => setData(d as { communities: Community[]; modularity: number; echo_chambers: unknown[] }))
      .catch((e) => setError((e as Error).message || 'Failed to load communities'))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useInjectionPaths(topK = 20) {
  const [paths, setPaths] = useState<InjectionPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.threats.injectionPaths(topK) as { paths?: InjectionPath[] };
      setPaths(res.paths ?? []);
    } catch (e) {
      setError((e as Error).message || 'Failed to load injection paths');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // topK change should refetch paths
  }, [topK]);

  return { paths, loading, error, reload: load };
}
