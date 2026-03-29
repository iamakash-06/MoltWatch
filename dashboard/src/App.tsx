import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  Pause, Play, X,
  Network, ShieldAlert, BarChart3, Users, GitBranch,
  TrendingUp, AlertTriangle, Activity, Info,
  Sparkles, ArrowRight,
} from 'lucide-react';
import { Layout } from './components/Layout';
import { GraphCanvas } from './components/GraphCanvas';
import { ThreatFeed } from './components/ThreatFeed';
import { MetricsPanel } from './components/MetricsPanel';
import { AgentDetail } from './components/AgentDetail';
import { SearchBar } from './components/SearchBar';
import { PathExplorer } from './components/PathExplorer';
import { CaseWorkspace } from './components/CaseWorkspace';
import { useGraphData, useNetworkOverview } from './hooks/useGraphData';
import { useCommunities, useThreats } from './hooks/useAnalysis';
import { communityColor, SEVERITY_BG, SEVERITY_BORDER, trustColor } from './lib/colors';
import { api } from './lib/api';

// ── Design tokens (inline for Tailwind compat) ────────────────────────────────
const T = {
  bg:       '#070b14',
  surface:  '#0b1221',
  card:     '#0e1625',
  elevated: '#132030',
  border:   '#1c2e44',
  borderDim:'#12202e',
  text:     '#dde4f0',
  muted:    '#8090a8',
  dim:      '#3d5068',
  cyan:     '#22d3ee',
  blue:     '#60a5fa',
  purple:   '#a78bfa',
  danger:   '#f43f5e',
  warning:  '#fbbf24',
  success:  '#34d399',
};

const cardStyle = { background: T.card, border: `1px solid ${T.border}` };
const sectionHeader = `text-xs font-bold uppercase tracking-[0.1em] flex items-center gap-2`;

// ─── Overview Page ────────────────────────────────────────────────────────────
function OverviewPage() {
  const { data: overview } = useNetworkOverview();
  const { threats, anomalies } = useThreats(60000);
  const [criticalNodes, setCriticalNodes] = useState<any[]>([]);

  useEffect(() => {
    api.threats.criticalNodes(5).then((d: any) => setCriticalNodes(d.critical_nodes || []));
  }, []);

  const allThreats = [...threats, ...anomalies];

  const statCards = overview
    ? [
        {
          label: 'Total Agents',
          sub:   'Distinct AI identities',
          value: (overview as any).agents?.toLocaleString() ?? '—',
          icon:  Users,
          accent: T.cyan,
        },
        {
          label: 'Submolts',
          sub:   'Active communities',
          value: (overview as any).submolts?.toLocaleString() ?? '—',
          icon:  GitBranch,
          accent: T.purple,
        },
        {
          label: 'Reply Edges',
          sub:   'Interaction links',
          value: (overview as any).reply_edges?.toLocaleString() ?? '—',
          icon:  Network,
          accent: T.blue,
        },
        {
          label: 'Communities',
          sub:   'Louvain clusters',
          value: (overview as any).community_count?.toLocaleString() ?? '—',
          icon:  BarChart3,
          accent: T.success,
        },
      ]
    : [];

  return (
    <div
      className="h-full min-h-0 overflow-y-auto"
      style={{ background: T.bg }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">

        {/* ── Page hero ── */}
        <div
          className="rounded-xl p-6 sm:p-7 relative isolate min-w-0"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          {/* Glow accent — clipped to card so it does not affect curve */}
          <div
            className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
            aria-hidden
          >
            <div
              className="absolute top-0 right-0 w-64 h-64"
              style={{
                background: 'radial-gradient(circle at top right, rgba(34,211,238,0.07), transparent 60%)',
              }}
            />
          </div>
          <div className="relative flex items-start gap-5 min-w-0">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)' }}
            >
              <Sparkles size={20} style={{ color: T.cyan }} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">Network Overview</h1>
              <p className="text-sm mt-2 leading-relaxed max-w-2xl break-words" style={{ color: T.muted }}>
                Real-time health briefing of the Moltbook agent social graph — scale, concentration
                risk, and community structure. Drill into the Graph Explorer to investigate threats.
              </p>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        {statCards.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
            {statCards.map(({ label, sub, value, icon: Icon, accent }) => (
              <div
                key={label}
                className="flex rounded-xl overflow-hidden min-w-0"
                style={{ background: T.card, border: `1px solid ${T.border}` }}
              >
                <div className="w-1 shrink-0 self-stretch" style={{ background: accent }} aria-hidden />
                <div className="p-6 flex flex-col gap-3 flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${accent}14`, border: `1px solid ${accent}30` }}
                    >
                      <Icon size={17} style={{ color: accent }} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-3xl font-bold font-mono text-white leading-none break-all">{value}</div>
                    <div className="text-sm font-medium text-white mt-2">{label}</div>
                    <div className="text-xs mt-1 leading-snug" style={{ color: T.dim }}>{sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Risk metrics + chart ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 min-w-0">

          {/* Key risk metrics */}
          {overview && (
            <div className="rounded-xl p-6 space-y-4 min-w-0" style={cardStyle}>
              <div className={sectionHeader} style={{ color: T.cyan }}>
                <TrendingUp size={13} /> Key Risk Metrics
              </div>
              {[
                {
                  label: 'Modularity (Q)',
                  value: (overview as any).modularity?.toFixed(4),
                  hint: 'Higher = stronger cluster separation. >0.9 = echo chamber risk.',
                  alert: ((overview as any).modularity ?? 0) > 0.9,
                },
                {
                  label: 'Karma Gini',
                  value: (overview as any).gini_karma?.toFixed(4),
                  hint: 'Engagement inequality. 1.0 = all engagement to one agent.',
                  alert: ((overview as any).gini_karma ?? 0) > 0.7,
                },
                {
                  label: 'PageRank Gini',
                  value: (overview as any).gini_pagerank?.toFixed(4),
                  hint: 'Influence concentration. Higher = more centralized power.',
                  alert: ((overview as any).gini_pagerank ?? 0) > 0.7,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl p-4 min-w-0"
                  style={{ background: T.elevated, border: `1px solid ${T.border}` }}
                >
                  <div className="flex justify-between items-baseline gap-2 min-w-0">
                    <span className="text-sm font-medium text-white min-w-0">{m.label}</span>
                    <span
                      className="font-mono text-base font-bold shrink-0"
                      style={{ color: m.alert ? T.warning : T.cyan }}
                    >
                      {m.value ?? '—'}
                    </span>
                  </div>
                  <p className="text-xs mt-2 leading-relaxed break-words" style={{ color: T.dim }}>{m.hint}</p>
                </div>
              ))}
            </div>
          )}

          {/* Metrics chart */}
          <div
            className="lg:col-span-2 rounded-xl overflow-hidden min-h-0 min-w-0"
            style={{ ...cardStyle, minHeight: 380 }}
          >
            <MetricsPanel />
          </div>
        </div>

        {/* ── Active threats + critical nodes ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 min-w-0">

          {/* Active threats bar chart */}
          <div className="rounded-xl p-6 space-y-5 min-w-0" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div className={sectionHeader} style={{ color: T.danger }}>
                <ShieldAlert size={13} /> Active Threats
              </div>
              <span className="text-xs font-mono" style={{ color: T.dim }}>{allThreats.length} total</span>
            </div>

            {allThreats.length === 0 ? (
              <div className="py-8 text-center">
                <div className="text-sm" style={{ color: T.dim }}>No active threats detected</div>
              </div>
            ) : (
              <div className="space-y-4">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                  const count = allThreats.filter((t) => t.severity === sev).length;
                  if (!count) return null;
                  const pct = (count / allThreats.length) * 100;
                  const color = SEVERITY_BORDER[sev];
                  return (
                    <div key={sev}>
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border w-20 text-center shrink-0 ${SEVERITY_BG[sev]}`}
                        >
                          {sev}
                        </span>
                        <div
                          className="flex-1 h-2 rounded-full overflow-hidden"
                          style={{ background: T.elevated }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                        <span className="text-sm font-mono font-bold w-5 text-right shrink-0" style={{ color: T.text }}>
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Critical nodes */}
          <div className="rounded-xl p-6 space-y-5 min-w-0" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div className={sectionHeader} style={{ color: T.warning }}>
                <AlertTriangle size={13} /> Critical Nodes
              </div>
              <span className="text-xs" style={{ color: T.dim }}>Highest blast radius</span>
            </div>

            {criticalNodes.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: T.dim }}>
                Run analysis to compute critical nodes
              </div>
            ) : (
              <div className="space-y-2.5">
                {criticalNodes.map((node: any, i: number) => {
                  const cColor = communityColor(node.community_id);
                  return (
                    <div
                      key={node.id}
                      className="flex items-center gap-3 p-3.5 rounded-xl min-w-0"
                      style={{ background: T.elevated, border: `1px solid ${T.border}` }}
                    >
                      <span className="text-xs font-mono w-5 shrink-0" style={{ color: T.dim }}>{i + 1}</span>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: `${cColor}18`, color: cColor, border: `1px solid ${cColor}35` }}
                      >
                        {node.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-white truncate break-all">{node.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: T.dim }}>
                          {node.blast_radius?.hop2
                            ? `2-hop reach: ${node.blast_radius.hop2} agents`
                            : `Community #${node.community_id}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono font-bold" style={{ color: T.warning }}>
                          {node.pagerank?.toFixed(2)}
                        </div>
                        <div className="text-xs" style={{ color: T.dim }}>PR</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Info footer ── */}
        <div
          className="rounded-xl px-5 py-4 flex items-start gap-3 text-sm min-w-0"
          style={{ background: T.card, border: `1px solid ${T.border}`, color: T.muted }}
        >
          <Info size={15} style={{ color: T.cyan }} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed min-w-0 break-words">
            Metrics reflect the current Neo4j graph snapshot. Re-run{' '}
            <code
              className="font-mono text-xs px-1.5 py-0.5 rounded"
              style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.cyan }}
            >
              scripts/run_analysis.py
            </code>{' '}
            to refresh intelligence.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Graph Page ───────────────────────────────────────────────────────────────
function GraphPage() {
  const [communityFilter, setCommunityFilter] = useState<number | undefined>(undefined);
  const [trustFilter, setTrustFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [focusMode, setFocusMode] = useState<'all' | 'ego1' | 'ego2'>('all');
  const [workspaceTab, setWorkspaceTab] = useState<'threats' | 'paths' | 'case'>('threats');
  const [playbackProgress, setPlaybackProgress] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const { nodes, edges, loading, error, reload } = useGraphData(communityFilter);
  const { data: communityData } = useCommunities();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [clearSearchSignal, setClearSearchSignal] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const trustFilteredNodes = useMemo(() => {
    if (trustFilter === 'all') return nodes;
    return nodes.filter((n) => {
      const score = n.trust_score ?? 0;
      if (trustFilter === 'high')   return score >= 70;
      if (trustFilter === 'medium') return score >= 40 && score < 70;
      return score < 40;
    });
  }, [nodes, trustFilter]);

  const temporalRange = useMemo(() => {
    const stamps = trustFilteredNodes
      .map((n) => (n.created_at ? Date.parse(n.created_at) : Number.NaN))
      .filter((ts) => Number.isFinite(ts));
    if (stamps.length === 0) return null;
    return { min: Math.min(...stamps), max: Math.max(...stamps) };
  }, [trustFilteredNodes]);

  const temporalCutoff = useMemo(() => {
    if (!temporalRange) return null;
    return temporalRange.min + ((temporalRange.max - temporalRange.min) * playbackProgress) / 100;
  }, [temporalRange, playbackProgress]);

  const temporallyFilteredNodes = useMemo(() => {
    if (!temporalCutoff) return trustFilteredNodes;
    return trustFilteredNodes.filter((n) => {
      if (!n.created_at) return true;
      const ts = Date.parse(n.created_at);
      if (!Number.isFinite(ts)) return true;
      return ts <= temporalCutoff;
    });
  }, [trustFilteredNodes, temporalCutoff]);

  const temporalIds = useMemo(() => new Set(temporallyFilteredNodes.map((n) => n.id)), [temporallyFilteredNodes]);
  const temporallyFilteredEdges = useMemo(
    () => edges.filter((e) => temporalIds.has(e.source) && temporalIds.has(e.target)),
    [edges, temporalIds],
  );

  const selectedAgentName = useMemo(
    () => temporallyFilteredNodes.find((n) => n.id === selectedAgent)?.name ?? selectedAgent,
    [temporallyFilteredNodes, selectedAgent],
  );

  const focusIds = useMemo(() => {
    if (!selectedAgent || focusMode === 'all') return null;
    const adjacency = new Map<string, Set<string>>();
    for (const edge of temporallyFilteredEdges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }
    const maxDepth = focusMode === 'ego1' ? 1 : 2;
    const visited  = new Set<string>([selectedAgent]);
    const queue: Array<{ id: string; depth: number }> = [{ id: selectedAgent, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (current.depth >= maxDepth) continue;
      for (const next of adjacency.get(current.id) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push({ id: next, depth: current.depth + 1 });
      }
    }
    return visited;
  }, [selectedAgent, focusMode, temporallyFilteredEdges]);

  const finalNodes = useMemo(() => {
    if (!focusIds) return temporallyFilteredNodes;
    return temporallyFilteredNodes.filter((n) => focusIds.has(n.id));
  }, [temporallyFilteredNodes, focusIds]);

  const finalNodeIds = useMemo(() => new Set(finalNodes.map((n) => n.id)), [finalNodes]);
  const finalEdges   = useMemo(
    () => temporallyFilteredEdges.filter((e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target)),
    [temporallyFilteredEdges, finalNodeIds],
  );

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setPlaybackProgress((prev) => {
        if (prev >= 100) { setIsPlaying(false); return 100; }
        return Math.min(100, prev + 2);
      });
    }, 240);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target   = event.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (event.key === '/' && !isTyping) { event.preventDefault(); searchInputRef.current?.focus(); }
      if (event.key === 'Escape') { setSelectedAgent(null); setHighlight([]); setFocusMode('all'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resetAllFilters = () => {
    setCommunityFilter(undefined);
    setTrustFilter('all');
    setFocusMode('all');
    setPlaybackProgress(100);
    setIsPlaying(false);
    setHighlight([]);
    setSelectedAgent(null);
    setClearSearchSignal((v) => v + 1);
  };

  const hasActiveFilters = communityFilter !== undefined || trustFilter !== 'all' || focusMode !== 'all' || playbackProgress < 100;

  const segBtn = (active: boolean) => ({
    background:  active ? 'rgba(34,211,238,0.12)' : 'transparent',
    border:      `1px solid ${active ? 'rgba(34,211,238,0.3)' : 'transparent'}`,
    color:       active ? T.cyan : T.muted,
  });

  return (
    <div className="flex h-full min-h-0" style={{ background: T.bg }}>

      {/* ── Graph + toolbar ── */}
      <div
        className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden"
        style={{ borderRight: `1px solid ${T.border}` }}
      >
        {/* Top bar */}
        <div
          className="px-6 py-4 shrink-0 space-y-4"
          style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
        >
          {/* Title row */}
          <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-center min-[520px]:gap-4 min-w-0">
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-white flex items-center gap-2.5">
                <Network size={16} style={{ color: T.cyan }} />
                Investigation Graph
              </h1>
              <p className="text-xs mt-1 break-words" style={{ color: T.dim }}>
                Hover a node to inspect · Click to open profile · Press{' '}
                <kbd
                  className="font-mono text-xs px-1.5 py-0.5 rounded"
                  style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.muted }}
                >
                  /
                </kbd>{' '}
                to search
              </p>
            </div>
            <div className="min-[520px]:ml-auto min-w-0 shrink-0 w-full min-[520px]:w-auto">
              <SearchBar
                onSelectAgent={(id) => { setSelectedAgent(id); setHighlight([id]); }}
                inputRef={searchInputRef}
                clearSignal={clearSearchSignal}
              />
            </div>
          </div>

          {/* Filter toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Community */}
            <select
              value={communityFilter ?? ''}
              onChange={(e) => setCommunityFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="text-sm rounded-xl px-3 py-2 focus:outline-none"
              style={{
                background: T.elevated,
                border:     `1px solid ${T.border}`,
                color:      T.text,
              }}
            >
              <option value="">All communities</option>
              {(communityData?.communities ?? []).map((c) => (
                <option key={c.community_id} value={c.community_id}>
                  Community #{c.community_id} ({c.member_count} agents)
                </option>
              ))}
            </select>

            {/* Trust filter pills */}
            <div
              className="flex items-center rounded-xl p-1 gap-1"
              style={{ background: T.elevated, border: `1px solid ${T.border}` }}
            >
              {[
                { id: 'all', label: 'All trust' },
                { id: 'high',   label: '≥ 70' },
                { id: 'medium', label: '40–69' },
                { id: 'low',    label: '< 40' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrustFilter(t.id as typeof trustFilter)}
                  className="text-sm rounded-lg px-3 py-1.5 font-medium transition-all"
                  style={segBtn(trustFilter === t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Ego focus pills */}
            <div
              className="flex items-center rounded-xl p-1 gap-1"
              style={{ background: T.elevated, border: `1px solid ${T.border}` }}
            >
              {[
                { id: 'all',  label: 'Full graph' },
                { id: 'ego1', label: '1-hop' },
                { id: 'ego2', label: '2-hop' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFocusMode(m.id as typeof focusMode)}
                  disabled={!selectedAgent && m.id !== 'all'}
                  className="text-sm rounded-lg px-3 py-1.5 font-medium transition-all disabled:opacity-30"
                  style={segBtn(focusMode === m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div className="flex items-center gap-2.5 flex-1 min-w-48">
              <button
                onClick={() => { if (playbackProgress >= 100) setPlaybackProgress(0); setIsPlaying((v) => !v); }}
                disabled={!temporalRange}
                className="text-sm rounded-xl px-3.5 py-2 flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-30"
                style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.text }}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <input
                type="range" min={0} max={100} value={playbackProgress}
                disabled={!temporalRange}
                onChange={(e) => { setPlaybackProgress(Number(e.target.value)); setIsPlaying(false); }}
                className="flex-1 disabled:opacity-30"
              />
              <span className="text-xs font-mono w-10 text-right shrink-0" style={{ color: T.dim }}>
                {playbackProgress}%
              </span>
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="text-sm rounded-xl px-3.5 py-2 flex items-center gap-1.5 shrink-0 transition-all"
                style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.muted }}
              >
                <X size={13} /> Reset
              </button>
            )}

            {/* Agent count */}
            <span className="text-sm font-mono ml-auto shrink-0" style={{ color: T.dim }}>
              <span style={{ color: T.cyan }}>{finalNodes.length.toLocaleString()}</span>
              {' / '}{nodes.length.toLocaleString()} agents
            </span>
          </div>

          {/* Active selection chips */}
          {(selectedAgent || highlight.length > 0) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {selectedAgent && (
                <span
                  className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background: 'rgba(34,211,238,0.08)',
                    border:     '1px solid rgba(34,211,238,0.25)',
                    color:      T.cyan,
                  }}
                >
                  Selected: <span className="font-mono font-semibold">{selectedAgentName}</span>
                  <button
                    onClick={() => { setSelectedAgent(null); setHighlight([]); }}
                    className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {highlight.length > 0 && (
                <span
                  className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
                  style={{
                    background: 'rgba(244,63,94,0.08)',
                    border:     '1px solid rgba(244,63,94,0.25)',
                    color:      T.danger,
                  }}
                >
                  {highlight.length} highlighted
                  <button
                    onClick={() => setHighlight([])}
                    className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3" style={{ color: T.dim }}>
              <Activity size={18} className="animate-pulse" style={{ color: T.cyan }} />
              <span className="text-sm">Loading graph data…</span>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-8">
              <div
                className="rounded-xl p-8 max-w-md text-center space-y-4 min-w-0 mx-4"
                style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)' }}
              >
                <div className="text-base font-semibold" style={{ color: T.danger }}>
                  Could not load graph data
                </div>
                <div className="text-sm font-mono break-all" style={{ color: 'rgba(244,63,94,0.7)' }}>{error}</div>
                <button
                  onClick={() => reload()}
                  className="text-sm rounded-xl px-5 py-2.5 transition-all"
                  style={{
                    background: 'rgba(244,63,94,0.12)',
                    border:     '1px solid rgba(244,63,94,0.3)',
                    color:      T.danger,
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <GraphCanvas
              nodes={finalNodes}
              edges={finalEdges}
              highlightAgents={highlight}
              onNodeClick={(id) => { setSelectedAgent(id); setHighlight([id]); }}
              emptyMessage="No agents match the current filters. Adjust or click Reset."
            />
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <aside
        className="w-[26rem] shrink-0 flex flex-col min-h-0"
        style={{ background: T.surface }}
      >
        {/* Agent detail */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ borderBottom: `1px solid ${T.border}` }}>
          <AgentDetail
            agentId={selectedAgent}
            onClose={() => { setSelectedAgent(null); setHighlight([]); }}
          />
        </div>

        {/* Workspace tabs */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            className="flex items-center gap-1 px-4 py-3 shrink-0"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            {[
              { id: 'threats', label: 'Threats' },
              { id: 'paths',   label: 'Inject Paths' },
              { id: 'case',    label: 'Case Notes' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setWorkspaceTab(tab.id as typeof workspaceTab)}
                className="text-sm px-3.5 py-2 rounded-xl font-medium transition-all"
                style={
                  workspaceTab === tab.id
                    ? { background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: T.cyan }
                    : { background: 'transparent', border: '1px solid transparent', color: T.dim }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {workspaceTab === 'threats' && (
              <ThreatFeed
                compact
                onInvestigate={(ids) => { setHighlight(ids); if (ids.length > 0) setSelectedAgent(ids[0]); }}
                onSelectAgent={(id) => { setSelectedAgent(id); setHighlight([id]); }}
                selectedAgentId={selectedAgent}
                highlightedAgentIds={highlight}
              />
            )}
            {workspaceTab === 'paths' && (
              <PathExplorer
                selectedAgentId={selectedAgent}
                onSelectAgent={(id) => { setSelectedAgent(id); setHighlight([id]); }}
                onHighlightPath={(ids) => setHighlight(ids)}
              />
            )}
            {workspaceTab === 'case' && (
              <CaseWorkspace
                selectedAgentId={selectedAgent}
                selectedAgentName={selectedAgentName}
                highlightedAgentIds={highlight}
                onSelectAgent={(id) => { setSelectedAgent(id); setHighlight([id]); }}
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Threats Page ─────────────────────────────────────────────────────────────
function ThreatsPage() {
  const { threats, anomalies, loading } = useThreats(30000);
  const [tab, setTab] = useState<'all' | 'campaigns' | 'anomalies'>('all');

  const allThreats = [...threats, ...anomalies].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity as keyof typeof order] ?? 2) - (order[b.severity as keyof typeof order] ?? 2);
  });

  const tabBtn = (active: boolean) => ({
    background: active ? 'rgba(34,211,238,0.1)'  : T.card,
    border:     active ? '1px solid rgba(34,211,238,0.28)' : `1px solid ${T.border}`,
    color:      active ? T.cyan : T.muted,
  });

  return (
    <div className="flex h-full min-h-0" style={{ background: T.bg }}>

      {/* Main */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden gap-0">
        {/* Page header */}
        <div
          className="px-5 sm:px-6 lg:px-8 py-5 sm:py-6 shrink-0 min-w-0"
          style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6 min-w-0">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <ShieldAlert size={22} style={{ color: T.danger }} />
                Threat Intelligence
              </h1>
              <p className="text-sm mt-2 leading-relaxed max-w-xl break-words" style={{ color: T.muted }}>
                Coordinated campaigns and temporal anomalies, ranked by severity.
                Click <strong className="text-white">Show in graph</strong> to highlight suspects.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-start shrink-0 lg:justify-end">
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                const count = allThreats.filter((t) => t.severity === sev).length;
                if (!count) return null;
                return (
                  <span key={sev} className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${SEVERITY_BG[sev]}`}>
                    {count} {sev}
                  </span>
                );
              })}
              {allThreats.length === 0 && !loading && (
                <span className="text-sm" style={{ color: T.dim }}>No active threats</span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mt-5">
            {[
              { id: 'all',       label: 'All',       count: allThreats.length  },
              { id: 'campaigns', label: 'Campaigns', count: threats.length     },
              { id: 'anomalies', label: 'Anomalies', count: anomalies.length   },
            ].map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setTab(id as typeof tab)}
                className="text-sm font-medium px-4 py-2 rounded-xl transition-all"
                style={tabBtn(tab === id)}
              >
                {label}
                <span className="ml-2 text-xs font-mono opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 lg:px-8 py-5">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-3" style={{ color: T.dim }}>
              <Activity size={16} className="animate-pulse" style={{ color: T.cyan }} />
              <span className="text-sm">Loading threats…</span>
            </div>
          ) : (
            <ThreatFeed />
          )}
        </div>
      </div>

      {/* Metrics sidebar */}
      <aside
        className="w-80 xl:w-96 shrink-0 flex flex-col overflow-hidden"
        style={{ background: T.surface, borderLeft: `1px solid ${T.border}` }}
      >
        <div
          className="px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${T.border}` }}
        >
          <div className={sectionHeader} style={{ color: T.cyan }}>
            <BarChart3 size={13} /> Network Metrics
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MetricsPanel />
        </div>
      </aside>
    </div>
  );
}

// ─── Agents Page ──────────────────────────────────────────────────────────────
function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { nodes } = useGraphData();
  const topAgents = [...nodes].sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0)).slice(0, 25);

  return (
    <div className="flex h-full min-h-0" style={{ background: T.bg }}>

      {/* Main */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-5 sm:px-6 lg:px-8 py-5 sm:py-6 shrink-0 min-w-0"
          style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6 min-w-0">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Users size={22} style={{ color: T.cyan }} />
                Agent Explorer
              </h1>
              <p className="text-sm mt-2 leading-relaxed break-words" style={{ color: T.muted }}>
                Top 25 agents by influence rank. Click a row to inspect trust, heartbeat, and timeline.
              </p>
            </div>
            <div className="shrink-0 w-full md:w-auto min-w-0">
              <SearchBar onSelectAgent={setSelectedAgent} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 lg:px-8 py-5">
          <div
            className="rounded-xl overflow-hidden min-w-0"
            style={{ border: `1px solid ${T.border}` }}
          >
            {/* Header row */}
            <div
              className="grid px-6 py-3.5"
              style={{
                gridTemplateColumns: '2.5rem 1fr 7rem 7rem 8rem 6rem',
                background: T.elevated,
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              {['#', 'Agent', 'PageRank', 'Degree', 'Trust', 'Community'].map((h) => (
                <span
                  key={h}
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: T.dim }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {topAgents.map((agent, i) => {
              const cColor   = communityColor(agent.community_id);
              const tColor   = trustColor(agent.trust_score);
              const isSelected = selectedAgent === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                  className="w-full grid px-6 py-4 transition-all text-left"
                  style={{
                    gridTemplateColumns: '2.5rem 1fr 7rem 7rem 8rem 6rem',
                    background: isSelected ? 'rgba(34,211,238,0.06)' : 'transparent',
                    boxShadow: isSelected ? `inset 3px 0 0 0 ${T.cyan}` : 'none',
                    borderBottom: `1px solid ${T.borderDim}`,
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = T.elevated; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span className="text-sm font-mono self-center" style={{ color: T.dim }}>{i + 1}</span>

                  <div className="flex items-center gap-2.5 min-w-0 self-center">
                    <div
                      className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ background: `${cColor}18`, color: cColor, border: `1px solid ${cColor}30` }}
                    >
                      {agent.name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="text-sm font-mono text-white truncate">{agent.name}</span>
                  </div>

                  <span className="text-sm font-mono self-center font-semibold" style={{ color: T.cyan }}>
                    {agent.pagerank?.toFixed(3) ?? '—'}
                  </span>

                  <span className="text-sm font-mono self-center" style={{ color: T.muted }}>
                    ↓{agent.in_degree ?? 0} ↑{agent.out_degree ?? 0}
                  </span>

                  <div className="flex items-center gap-2.5 self-center">
                    <div
                      className="w-14 h-1.5 rounded-full overflow-hidden shrink-0"
                      style={{ background: T.elevated }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${agent.trust_score ?? 0}%`, background: tColor }}
                      />
                    </div>
                    <span className="text-sm font-mono font-bold" style={{ color: tColor }}>
                      {agent.trust_score !== undefined ? Math.round(agent.trust_score) : '—'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-center">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: cColor }}
                    />
                    <span className="text-sm font-mono" style={{ color: T.muted }}>
                      #{agent.community_id ?? '?'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedAgent && (
        <aside
          className="w-96 shrink-0 flex flex-col overflow-hidden"
          style={{ background: T.surface, borderLeft: `1px solid ${T.border}` }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AgentDetail agentId={selectedAgent} onClose={() => setSelectedAgent(null)} />
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Communities Page ─────────────────────────────────────────────────────────
function CommunitiesPage() {
  const { data: communityData } = useCommunities();
  const { nodes } = useGraphData();
  const { data: overview } = useNetworkOverview();

  const communities  = (communityData?.communities ?? []) as any[];
  const echoChambers = (communityData?.echo_chambers ?? []) as any[];
  const echoIds      = new Set(echoChambers.map((e: any) => e.community_id));

  return (
    <div className="h-full min-h-0 overflow-y-auto min-w-0" style={{ background: T.bg }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5">

        {/* Header */}
        <div
          className="rounded-xl p-6 sm:p-7 relative isolate min-w-0"
          style={{ background: T.card, border: `1px solid ${T.border}` }}
        >
          <div
            className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
            aria-hidden
          >
            <div
              className="absolute top-0 right-0 w-72 h-72"
              style={{ background: 'radial-gradient(circle at top right, rgba(167,139,250,0.06), transparent 60%)' }}
            />
          </div>
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between min-w-0">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <GitBranch size={22} style={{ color: T.purple }} />
                Community Analysis
              </h1>
              <p className="text-sm mt-2 leading-relaxed max-w-2xl break-words" style={{ color: T.muted }}>
                Louvain-detected clusters in the agent social graph. High isolation ratios and fast
                formation speed are indicators of echo chambers or coordinated inauthentic communities.
              </p>
            </div>
            {overview && (
              <div
                className="rounded-xl px-6 py-5 text-center shrink-0 w-full sm:w-auto"
                style={{
                  background: 'rgba(167,139,250,0.07)',
                  border:     '1px solid rgba(167,139,250,0.25)',
                }}
              >
                <div className="text-3xl font-bold font-mono text-white">
                  {(overview as any).modularity?.toFixed(3)}
                </div>
                <div className="text-xs mt-1.5" style={{ color: T.dim }}>Modularity Q</div>
                <div
                  className="text-xs mt-1 font-semibold"
                  style={{
                    color: ((overview as any).modularity ?? 0) > 0.9
                      ? T.warning
                      : ((overview as any).modularity ?? 0) > 0.6
                        ? T.success
                        : T.muted,
                  }}
                >
                  {((overview as any).modularity ?? 0) > 0.9
                    ? '⚠ Echo chamber risk'
                    : ((overview as any).modularity ?? 0) > 0.6
                      ? '⚡ Strong structure'
                      : '✓ Moderate'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Echo chamber warning */}
        {echoChambers.length > 0 && (
          <div
            className="rounded-xl p-5 flex items-start gap-4"
            style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)' }}
          >
            <AlertTriangle size={18} style={{ color: T.danger }} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold" style={{ color: T.danger }}>
                {echoChambers.length} echo chamber{echoChambers.length > 1 ? 's' : ''} detected
              </div>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'rgba(244,63,94,0.7)' }}>
                These communities have extreme internal density with minimal external connections —
                a strong indicator of coordinated amplification or ideological isolation.
              </p>
            </div>
          </div>
        )}

        {/* Community cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 min-w-0">
          {communities.length === 0 ? (
            <div className="col-span-full py-16 text-center" style={{ color: T.dim }}>
              <div className="text-sm">No community data.</div>
              <div className="text-xs mt-2">
                Run{' '}
                <code
                  className="font-mono px-1.5 py-0.5 rounded"
                  style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.cyan }}
                >
                  scripts/run_analysis.py
                </code>{' '}
                first.
              </div>
            </div>
          ) : (
            communities.map((c: any) => {
              const cColor    = communityColor(c.community_id);
              const isEcho    = echoIds.has(c.community_id);
              const totalEdges = (c.internal_edges ?? 0) + (c.external_edges ?? 0);
              const isolation = totalEdges > 0 ? (c.internal_edges ?? 0) / totalEdges : 0;
              const topAgts   = nodes
                .filter((n) => n.community_id === c.community_id)
                .sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0))
                .slice(0, 3);
              const isoColor  = isolation > 0.85 ? T.danger : isolation > 0.6 ? T.warning : cColor;

              return (
                <div
                  key={c.community_id}
                  className="rounded-xl overflow-hidden min-w-0"
                  style={{
                    background: T.card,
                    border:     `1px solid ${T.border}`,
                  }}
                >
                  <div className="h-1 w-full shrink-0" style={{ background: cColor }} aria-hidden />
                  {/* Card header */}
                  <div className="px-5 py-4 flex items-center justify-between gap-2 min-w-0" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: `${cColor}18`, color: cColor }}
                      >
                        #{c.community_id}
                      </div>
                      <span className="text-sm font-semibold text-white">Community {c.community_id}</span>
                    </div>
                    {isEcho && (
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', color: T.danger }}
                      >
                        ⚠ Echo
                      </span>
                    )}
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className="rounded-xl p-4"
                        style={{ background: T.elevated, border: `1px solid ${T.border}` }}
                      >
                        <div className="text-2xl font-bold font-mono text-white">{c.member_count}</div>
                        <div className="text-xs mt-1" style={{ color: T.dim }}>members</div>
                      </div>
                      <div
                        className="rounded-xl p-4"
                        style={{ background: T.elevated, border: `1px solid ${T.border}` }}
                      >
                        <div className="text-2xl font-bold font-mono" style={{ color: isoColor }}>
                          {Math.round(isolation * 100)}%
                        </div>
                        <div className="text-xs mt-1" style={{ color: T.dim }}>isolation</div>
                      </div>
                    </div>

                    {/* Isolation bar */}
                    <div>
                      <div className="flex justify-between text-xs mb-2" style={{ color: T.dim }}>
                        <span>Internal connectivity</span>
                        <span>{c.internal_edges ?? '?'} int / {c.external_edges ?? '?'} ext</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: T.elevated }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${isolation * 100}%`, background: isoColor }}
                        />
                      </div>
                    </div>

                    {/* Top agents */}
                    {topAgts.length > 0 && (
                      <div>
                        <div
                          className="text-xs font-bold uppercase tracking-wider mb-3"
                          style={{ color: T.dim }}
                        >
                          Top influencers
                        </div>
                        <div className="space-y-2">
                          {topAgts.map((a) => (
                            <div key={a.id} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <ArrowRight size={11} style={{ color: cColor }} className="shrink-0" />
                                <span className="text-sm font-mono truncate" style={{ color: T.text }}>
                                  {a.name}
                                </span>
                              </div>
                              <span className="text-xs font-mono shrink-0" style={{ color: T.dim }}>
                                PR {a.pagerank?.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Full metrics panel */}
        <div className="rounded-xl overflow-hidden min-h-0 min-w-0" style={cardStyle}>
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className={sectionHeader} style={{ color: T.cyan }}>
              <BarChart3 size={13} /> Distribution Metrics
            </div>
          </div>
          <div style={{ minHeight: 380 }}>
            <MetricsPanel />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"            element={<OverviewPage />}    />
          <Route path="/graph"       element={<GraphPage />}       />
          <Route path="/threats"     element={<ThreatsPage />}     />
          <Route path="/agents"      element={<AgentsPage />}      />
          <Route path="/communities" element={<CommunitiesPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
