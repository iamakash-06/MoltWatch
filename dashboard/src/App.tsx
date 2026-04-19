import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  Pause, Play, X, RefreshCw,
  Network, ShieldAlert, BarChart3, Users, GitBranch,
  TrendingUp, AlertTriangle, Activity, Sparkles,
  ServerOff, Search,
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#0a0a0c',
  surface:  '#111115',
  card:     '#1a1a1f',
  elevated: '#222228',
  hover:    '#2a2a32',
  border:   'rgba(255,255,255,0.07)',
  borderMd: 'rgba(255,255,255,0.13)',
  text:     '#f2f2f5',
  muted:    '#9b9baa',
  dim:      '#6b6b7a',
  xdim:     '#46464f',
  orange:   '#f97316',
  green:    '#22c55e',
  red:      '#ef4444',
  amber:    '#f59e0b',
  cyan:     '#22d3ee',
  blue:     '#60a5fa',
  purple:   '#a78bfa',
} as const;

// ── Shared atoms ──────────────────────────────────────────────────────────────
const card = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  ...extra,
});

function Divider() {
  return <div style={{ height: 1, background: T.border, margin: '0 -24px' }} />;
}

function SectionLabel({ children, icon: Icon, color = T.dim }: {
  children: React.ReactNode; icon?: React.ElementType; color?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {Icon && <Icon size={13} style={{ color, flexShrink: 0 }} />}
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim }}>
        {children}
      </span>
    </div>
  );
}

function PageHeader({
  icon: Icon, title, subtitle, accent = T.orange, right, border = true,
}: {
  icon: React.ElementType; title: string; subtitle?: React.ReactNode;
  accent?: string; right?: React.ReactNode; border?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 20, padding: '16px 32px', flexShrink: 0,
      background: T.surface,
      borderBottom: border ? `1px solid ${T.border}` : 'none',
    }}>
      {/* Left: icon + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 180, flex: 1 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}14`, border: `1px solid ${accent}28`,
        }}>
          <Icon size={16} style={{ color: accent }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '-0.02em',
            lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: 12, color: T.dim, marginTop: 2, lineHeight: 1.4,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {/* Right: optional actions/search */}
      {right && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {right}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon = ServerOff, title = 'No data', message, color = T.dim,
}: {
  icon?: React.ElementType; title?: string; message?: string; color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 12 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`, border: `1px solid ${color}22`,
      }}>
        <Icon size={22} style={{ color, opacity: 0.6 }} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.muted }}>{title}</div>
        {message && <div style={{ fontSize: 12, color: T.xdim, marginTop: 4, maxWidth: 260, lineHeight: 1.5 }}>{message}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent, icon: Icon, loading = false }: {
  label: string; value?: string; sub?: string; accent: string;
  icon: React.ElementType; loading?: boolean;
}) {
  return (
    <div style={{ ...card(), padding: '22px 24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 140, height: 140, pointerEvents: 'none',
        background: `radial-gradient(circle at top right, ${accent}09, transparent 55%)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${accent}14`, border: `1px solid ${accent}22`, flexShrink: 0,
        }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skeleton" style={{ height: 32, width: '60%' }} />
          <div className="skeleton" style={{ height: 14, width: '80%' }} />
          <div className="skeleton" style={{ height: 12, width: '50%' }} />
        </div>
      ) : (
        <>
          <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: T.text, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {value ?? '—'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.muted, marginTop: 8 }}>{label}</div>
          {sub && <div style={{ fontSize: 12, color: T.xdim, marginTop: 2 }}>{sub}</div>}
        </>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(to right, ${accent}cc, transparent)`,
      }} />
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function OverviewPage() {
  const { data: overview } = useNetworkOverview();
  const { threats, anomalies } = useThreats(60_000);
  const [criticalNodes, setCriticalNodes] = useState<any[]>([]);
  const ov = overview as any;

  useEffect(() => {
    api.threats.criticalNodes(5)
      .then((d: any) => setCriticalNodes(d.critical_nodes ?? []))
      .catch(() => {});
  }, []);

  const allThreats = [...threats, ...anomalies];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.bg }} className="fade-in">
      <PageHeader
        icon={Sparkles}
        title="Network Overview"
        subtitle="Real-time health briefing of the Moltbook agent social graph"
        accent={T.cyan}
      />

      <div style={{ padding: '28px 32px', maxWidth: 1440, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard label="Total Agents"  value={ov?.agents?.toLocaleString()}         sub="Distinct AI identities"  accent={T.cyan}   icon={Users}     loading={!ov} />
          <StatCard label="Communities"   value={ov?.community_count?.toString()}       sub="Louvain clusters"         accent={T.purple} icon={GitBranch} loading={!ov} />
          <StatCard label="Reply Edges"   value={ov?.reply_edges?.toLocaleString()}     sub="Interaction links"        accent={T.blue}   icon={Network}   loading={!ov} />
          <StatCard label="Submolts"      value={ov?.submolts?.toLocaleString()}        sub="Active topic communities" accent={T.green}  icon={BarChart3} loading={!ov} />
        </div>

        {/* ── Risk metrics + timeline chart ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>

          {/* Risk metrics */}
          <div style={{ ...card(), padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><SectionLabel icon={TrendingUp} color={T.orange}>Risk Metrics</SectionLabel></div>
            {ov ? (
              [
                { label: 'Modularity (Q)',  val: ov.modularity?.toFixed(4),    alert: (ov.modularity ?? 0) > 0.9,    hint: 'Echo chamber risk above 0.9' },
                { label: 'Karma Gini',      val: ov.gini_karma?.toFixed(4),    alert: (ov.gini_karma ?? 0) > 0.7,    hint: 'Engagement inequality index' },
                { label: 'PageRank Gini',   val: ov.gini_pagerank?.toFixed(4), alert: (ov.gini_pagerank ?? 0) > 0.7, hint: 'Influence concentration index' },
              ].map(m => (
                <div key={m.label} style={{ background: T.elevated, borderRadius: 9, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: T.muted }}>{m.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: m.alert ? T.amber : T.cyan }}>
                      {m.val ?? '—'}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: m.alert ? T.amber : T.xdim, lineHeight: 1.4 }}>{m.hint}</p>
                  {m.alert && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: T.amber, background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '2px 6px',
                      border: '1px solid rgba(245,158,11,0.25)',
                    }}>
                      ⚠ Warning
                    </div>
                  )}
                </div>
              ))
            ) : (
              <EmptyState icon={Activity} title="Awaiting connection" message="Start the API server to load metrics" color={T.dim} />
            )}
          </div>

          {/* Chart */}
          <div style={{ ...card(), overflow: 'hidden', minHeight: 340 }}>
            <MetricsPanel />
          </div>
        </div>

        {/* ── Active threats + critical nodes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Active threats */}
          <div style={{ ...card(), padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div><SectionLabel icon={ShieldAlert} color={T.red}>Active Threats</SectionLabel></div>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.xdim }}>
                {allThreats.length} total
              </span>
            </div>
            {allThreats.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="All clear" message="No active threats in current snapshot" color={T.green} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => {
                  const cnt = allThreats.filter(t => t.severity === sev).length;
                  if (!cnt) return null;
                  const pct = (cnt / allThreats.length) * 100;
                  const col = SEVERITY_BORDER[sev];
                  return (
                    <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${SEVERITY_BG[sev]}`}
                        style={{ width: 76, textAlign: 'center', flexShrink: 0 }}>
                        {sev}
                      </span>
                      <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.elevated, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.text, width: 20, textAlign: 'right', flexShrink: 0 }}>
                        {cnt}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Critical nodes */}
          <div style={{ ...card(), padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div><SectionLabel icon={AlertTriangle} color={T.amber}>Critical Nodes</SectionLabel></div>
              <span style={{ fontSize: 12, color: T.xdim }}>Highest blast radius</span>
            </div>
            {criticalNodes.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No data" message="Run analysis to identify critical nodes" color={T.amber} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {criticalNodes.map((node: any, i: number) => {
                  const cc = communityColor(node.community_id);
                  return (
                    <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.elevated, borderRadius: 9, padding: '10px 14px' }}>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.xdim, width: 18, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        background: `${cc}18`, color: cc, border: `1px solid ${cc}35`,
                      }}>
                        {node.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontFamily: 'monospace', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {node.name}
                        </div>
                        <div style={{ fontSize: 11, color: T.xdim, marginTop: 2 }}>
                          {node.blast_radius?.hop2 ? `2-hop reach: ${node.blast_radius.hop2} agents` : `Community #${node.community_id}`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', color: T.amber }}>
                          {node.pagerank?.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 10, color: T.xdim }}>PR</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Graph Page ───────────────────────────────────────────────────────────────
function GraphPage() {
  const [communityFilter, setCommunityFilter] = useState<number | undefined>();
  const [trustFilter, setTrustFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [focusMode, setFocusMode] = useState<'all' | 'ego1' | 'ego2'>('all');
  const [workspaceTab, setWorkspaceTab] = useState<'threats' | 'paths' | 'case'>('threats');
  const [playbackProgress, setPlaybackProgress] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const { nodes, edges, loading, error, reload } = useGraphData(communityFilter);
  const { data: communityData } = useCommunities();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [clearSignal, setClearSignal] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const trustFiltered = useMemo(() => {
    if (trustFilter === 'all') return nodes;
    return nodes.filter(n => {
      const s = n.trust_score ?? 0;
      if (trustFilter === 'high')   return s >= 70;
      if (trustFilter === 'medium') return s >= 40 && s < 70;
      return s < 40;
    });
  }, [nodes, trustFilter]);

  const temporalRange = useMemo(() => {
    const stamps = trustFiltered.map(n => n.created_at ? Date.parse(n.created_at) : NaN).filter(isFinite);
    if (!stamps.length) return null;
    return { min: Math.min(...stamps), max: Math.max(...stamps) };
  }, [trustFiltered]);

  const temporalCutoff = useMemo(() => {
    if (!temporalRange) return null;
    return temporalRange.min + (temporalRange.max - temporalRange.min) * playbackProgress / 100;
  }, [temporalRange, playbackProgress]);

  const timeNodes = useMemo(() => {
    if (!temporalCutoff) return trustFiltered;
    return trustFiltered.filter(n => {
      if (!n.created_at) return true;
      const ts = Date.parse(n.created_at);
      return !isFinite(ts) || ts <= temporalCutoff;
    });
  }, [trustFiltered, temporalCutoff]);

  const timeIds   = useMemo(() => new Set(timeNodes.map(n => n.id)), [timeNodes]);
  const timeEdges = useMemo(() => edges.filter(e => timeIds.has(e.source) && timeIds.has(e.target)), [edges, timeIds]);

  const selectedName = useMemo(() => timeNodes.find(n => n.id === selectedAgent)?.name ?? selectedAgent, [timeNodes, selectedAgent]);

  const focusIds = useMemo(() => {
    if (!selectedAgent || focusMode === 'all') return null;
    const adj = new Map<string, Set<string>>();
    for (const e of timeEdges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
    const maxD   = focusMode === 'ego1' ? 1 : 2;
    const visited = new Set([selectedAgent]);
    const queue   = [{ id: selectedAgent, depth: 0 }];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.depth >= maxD) continue;
      for (const next of adj.get(cur.id) ?? []) {
        if (!visited.has(next)) { visited.add(next); queue.push({ id: next, depth: cur.depth + 1 }); }
      }
    }
    return visited;
  }, [selectedAgent, focusMode, timeEdges]);

  const finalNodes = useMemo(() => focusIds ? timeNodes.filter(n => focusIds.has(n.id)) : timeNodes, [timeNodes, focusIds]);
  const finalIds   = useMemo(() => new Set(finalNodes.map(n => n.id)), [finalNodes]);
  const finalEdges = useMemo(() => timeEdges.filter(e => finalIds.has(e.source) && finalIds.has(e.target)), [timeEdges, finalIds]);

  useEffect(() => {
    if (!isPlaying) return;
    const t = window.setInterval(() => {
      setPlaybackProgress(p => { if (p >= 100) { setIsPlaying(false); return 100; } return Math.min(100, p + 2); });
    }, 240);
    return () => window.clearInterval(t);
  }, [isPlaying]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { setSelectedAgent(null); setHighlight([]); setFocusMode('all'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reset = () => {
    setCommunityFilter(undefined); setTrustFilter('all'); setFocusMode('all');
    setPlaybackProgress(100); setIsPlaying(false); setHighlight([]); setSelectedAgent(null);
    setClearSignal(v => v + 1);
  };

  const hasFilters = communityFilter !== undefined || trustFilter !== 'all' || focusMode !== 'all' || playbackProgress < 100;

  const segBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(249,115,22,0.4)' : 'transparent'}`,
    background: active ? 'rgba(249,115,22,0.12)' : 'transparent',
    color: active ? T.orange : T.dim,
    transition: 'all 0.12s',
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: T.bg }} className="fade-in">

      {/* ── Canvas area ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>

        {/* Header */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>

          {/* Row 1: title + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <Network size={15} style={{ color: T.orange, flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>
                Investigation Graph
              </span>
              <span style={{ fontSize: 12, color: T.xdim, marginLeft: 4 }}>
                · hover a node to inspect, click to focus, <kbd style={{ fontFamily: 'monospace', fontSize: 11, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 4, padding: '0 5px', color: T.dim }}>/</kbd> to search
              </span>
            </div>
            <SearchBar
              onSelectAgent={id => { setSelectedAgent(id); setHighlight([id]); }}
              inputRef={searchRef}
              clearSignal={clearSignal}
            />
          </div>

          {/* Row 2: filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 12px', flexWrap: 'wrap' }}>

            {/* Community dropdown */}
            <select
              value={communityFilter ?? ''}
              onChange={e => setCommunityFilter(e.target.value ? Number(e.target.value) : undefined)}
              style={{
                fontSize: 13, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                background: T.elevated, border: `1px solid ${T.border}`, color: T.muted,
              }}
            >
              <option value="">All communities</option>
              {(communityData?.communities ?? []).map(c => (
                <option key={c.community_id} value={c.community_id}>
                  Community #{c.community_id} ({c.member_count})
                </option>
              ))}
            </select>

            {/* Trust pills */}
            <div style={{ display: 'flex', alignItems: 'center', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, gap: 2 }}>
              {[{ id: 'all', l: 'All trust' }, { id: 'high', l: '≥ 70' }, { id: 'medium', l: '40–69' }, { id: 'low', l: '< 40' }].map(t => (
                <button key={t.id} onClick={() => setTrustFilter(t.id as any)} style={segBtn(trustFilter === t.id)}>{t.l}</button>
              ))}
            </div>

            {/* Ego pills */}
            <div style={{ display: 'flex', alignItems: 'center', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, gap: 2 }}>
              {[{ id: 'all', l: 'Full graph' }, { id: 'ego1', l: '1-hop' }, { id: 'ego2', l: '2-hop' }].map(m => (
                <button key={m.id} onClick={() => setFocusMode(m.id as any)} disabled={!selectedAgent && m.id !== 'all'} style={{ ...segBtn(focusMode === m.id), opacity: (!selectedAgent && m.id !== 'all') ? 0.3 : 1 }}>{m.l}</button>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
              <button
                onClick={() => { if (playbackProgress >= 100) setPlaybackProgress(0); setIsPlaying(v => !v); }}
                disabled={!temporalRange}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 10px', borderRadius: 7, background: T.elevated, border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer', flexShrink: 0, opacity: !temporalRange ? 0.35 : 1 }}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <input type="range" min={0} max={100} value={playbackProgress}
                disabled={!temporalRange}
                onChange={e => { setPlaybackProgress(Number(e.target.value)); setIsPlaying(false); }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: T.xdim, width: 32, textAlign: 'right', flexShrink: 0 }}>
                {playbackProgress}%
              </span>
            </div>

            {/* Count */}
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.xdim, marginLeft: 'auto', flexShrink: 0 }}>
              <span style={{ color: T.orange, fontWeight: 600 }}>{finalNodes.length.toLocaleString()}</span>
              {' / '}{nodes.length.toLocaleString()} agents
            </span>

            {hasFilters && (
              <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 10px', borderRadius: 7, background: T.elevated, border: `1px solid ${T.border}`, color: T.dim, cursor: 'pointer', flexShrink: 0 }}>
                <X size={11} /> Reset
              </button>
            )}
          </div>

          {/* Active chips */}
          {(selectedAgent || highlight.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 20px 10px' }}>
              {selectedAgent && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '4px 12px', borderRadius: 99, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.28)', color: T.orange }}>
                  Selected: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{selectedName}</span>
                  <button onClick={() => { setSelectedAgent(null); setHighlight([]); }} style={{ opacity: 0.6, cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', display: 'flex', alignItems: 'center' }}>
                    <X size={11} />
                  </button>
                </span>
              )}
              {highlight.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '4px 12px', borderRadius: 99, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: T.red }}>
                  {highlight.length} highlighted
                  <button onClick={() => setHighlight([])} style={{ opacity: 0.6, cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', display: 'flex', alignItems: 'center' }}>
                    <X size={11} />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: T.dim }}>
              <Activity size={16} style={{ color: T.orange }} className="animate-pulse" />
              <span style={{ fontSize: 14 }}>Loading graph data…</span>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
              <div style={{ ...card(), padding: 36, maxWidth: 380, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <ServerOff size={22} style={{ color: T.red, opacity: 0.7 }} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.muted }}>Graph unavailable</div>
                  <div style={{ fontSize: 12, color: T.xdim, marginTop: 6, lineHeight: 1.5 }}>
                    Could not connect to the API server. Make sure the backend is running on port 8000.
                  </div>
                </div>
                <button onClick={reload} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, padding: '9px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: T.red, cursor: 'pointer' }}>
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            </div>
          ) : (
            <GraphCanvas
              nodes={finalNodes}
              edges={finalEdges}
              highlightAgents={highlight}
              onNodeClick={id => { setSelectedAgent(id); setHighlight([id]); }}
              emptyMessage="No agents match the current filters."
            />
          )}
        </div>
      </div>

      {/* ── Right sidebar ── */}
      <aside style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: T.surface }}>

        {/* Agent detail */}
        <div style={{ flex: '0 0 auto', maxHeight: '50%', minHeight: 0, overflowY: 'auto', borderBottom: `1px solid ${T.border}` }}>
          <AgentDetail agentId={selectedAgent} onClose={() => { setSelectedAgent(null); setHighlight([]); }} />
        </div>

        {/* Workspace tabs */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {[{ id: 'threats', l: 'Threats' }, { id: 'paths', l: 'Inject Paths' }, { id: 'case', l: 'Case Notes' }].map(tab => (
              <button key={tab.id} onClick={() => setWorkspaceTab(tab.id as any)} style={{
                fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                background: workspaceTab === tab.id ? 'rgba(249,115,22,0.12)' : 'transparent',
                border: `1px solid ${workspaceTab === tab.id ? 'rgba(249,115,22,0.35)' : 'transparent'}`,
                color: workspaceTab === tab.id ? T.orange : T.dim,
                transition: 'all 0.12s',
              }}>
                {tab.l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
            {workspaceTab === 'threats' && (
              <ThreatFeed compact onInvestigate={ids => { setHighlight(ids); if (ids.length) setSelectedAgent(ids[0]); }}
                onSelectAgent={id => { setSelectedAgent(id); setHighlight([id]); }}
                selectedAgentId={selectedAgent} highlightedAgentIds={highlight} />
            )}
            {workspaceTab === 'paths' && (
              <PathExplorer selectedAgentId={selectedAgent}
                onSelectAgent={id => { setSelectedAgent(id); setHighlight([id]); }}
                onHighlightPath={setHighlight} />
            )}
            {workspaceTab === 'case' && (
              <CaseWorkspace selectedAgentId={selectedAgent} selectedAgentName={selectedName}
                highlightedAgentIds={highlight}
                onSelectAgent={id => { setSelectedAgent(id); setHighlight([id]); }} />
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── Threats Page ─────────────────────────────────────────────────────────────
function ThreatsPage() {
  const { threats, anomalies, loading } = useThreats(30_000);
  const [tab, setTab] = useState<'all' | 'campaigns' | 'anomalies'>('all');

  const all = [...threats, ...anomalies].sort((a, b) => {
    const ord = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (ord[a.severity as keyof typeof ord] ?? 2) - (ord[b.severity as keyof typeof ord] ?? 2);
  });

  const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  all.forEach(t => { if (t.severity in severityCounts) severityCounts[t.severity]++; });

  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
    background: active ? 'rgba(249,115,22,0.12)' : T.card,
    border: `1px solid ${active ? 'rgba(249,115,22,0.35)' : T.border}`,
    color: active ? T.orange : T.dim,
    transition: 'all 0.12s',
  });

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: T.bg }} className="fade-in">

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PageHeader
          icon={ShieldAlert}
          title="Threat Intelligence"
          subtitle="Coordinated campaigns and temporal anomalies, ranked by severity"
          accent={T.red}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => {
                const cnt = severityCounts[sev];
                if (!cnt) return null;
                return <span key={sev} className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${SEVERITY_BG[sev]}`}>{cnt} {sev}</span>;
              })}
            </div>
          }
        />

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          {[
            { id: 'all',       l: 'All',       cnt: all.length },
            { id: 'campaigns', l: 'Campaigns', cnt: threats.length },
            { id: 'anomalies', l: 'Anomalies', cnt: anomalies.length },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)} style={tabBtn(tab === t.id)}>
              {t.l}
              <span style={{ marginLeft: 6, fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.55 }}>{t.cnt}</span>
            </button>
          ))}
        </div>

        {/* Feed */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, gap: 10, color: T.dim }}>
              <Activity size={15} style={{ color: T.orange }} className="animate-pulse" />
              <span style={{ fontSize: 14 }}>Loading threats…</span>
            </div>
          ) : (
            <ThreatFeed />
          )}
        </div>
      </div>

      {/* Metrics sidebar */}
      <aside style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface, borderLeft: `1px solid ${T.border}` }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div><SectionLabel icon={BarChart3} color={T.cyan}>Network Metrics</SectionLabel></div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <MetricsPanel />
        </div>
      </aside>
    </div>
  );
}

// ─── Agents Page ──────────────────────────────────────────────────────────────
function AgentsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes } = useGraphData();
  const top = [...nodes].sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0)).slice(0, 25);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, background: T.bg }} className="fade-in">
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PageHeader
          icon={Users}
          title="Agent Explorer"
          subtitle="Top 25 agents by influence rank — click a row for full profile"
          accent={T.blue}
          right={<SearchBar onSelectAgent={setSelected} />}
        />

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px' }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>

            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 100px 100px 130px 90px',
              padding: '10px 20px',
              background: T.elevated,
              borderBottom: `1px solid ${T.border}`,
            }}>
              {['#', 'Agent', 'PageRank', 'Degree', 'Trust', 'Community'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: T.xdim }}>{h}</span>
              ))}
            </div>

            {top.length === 0 ? (
              <EmptyState icon={Users} title="No agents loaded" message="Start the API server to load agent data" color={T.dim} />
            ) : (
              top.map((agent, i) => {
                const cc  = communityColor(agent.community_id);
                const tc  = trustColor(agent.trust_score);
                const sel = selected === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelected(sel ? null : agent.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: '44px 1fr 100px 100px 130px 90px',
                      padding: '12px 20px', width: '100%', textAlign: 'left',
                      background: sel ? 'rgba(249,115,22,0.07)' : 'transparent',
                      borderBottom: `1px solid ${T.border}`,
                      borderLeft: `3px solid ${sel ? T.orange : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = T.elevated; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.xdim, alignSelf: 'center' }}>{i + 1}</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, alignSelf: 'center' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: `${cc}18`, color: cc, border: `1px solid ${cc}30` }}>
                        {agent.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.name}
                      </span>
                    </div>

                    <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: T.cyan, alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      {agent.pagerank?.toFixed(3) ?? '—'}
                    </span>

                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.muted, alignSelf: 'center' }}>
                      ↓{agent.in_degree ?? 0} ↑{agent.out_degree ?? 0}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
                      <div style={{ width: 56, height: 5, borderRadius: 99, background: T.elevated, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ height: '100%', width: `${agent.trust_score ?? 0}%`, background: tc, borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: tc, fontVariantNumeric: 'tabular-nums' }}>
                        {agent.trust_score !== undefined ? Math.round(agent.trust_score) : '—'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: cc, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, fontFamily: 'monospace', color: T.dim }}>#{agent.community_id ?? '?'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <aside style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface, borderLeft: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <AgentDetail agentId={selected} onClose={() => setSelected(null)} />
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
  const ov = overview as any;

  const communities  = (communityData?.communities ?? []) as any[];
  const echoChambers = (communityData?.echo_chambers ?? []) as any[];
  const echoIds      = new Set(echoChambers.map((e: any) => e.community_id));

  const modScore = ov?.modularity ?? 0;
  const modLabel = modScore > 0.9 ? '⚠ Echo chamber risk' : modScore > 0.6 ? '⚡ Strong structure' : '✓ Moderate';
  const modColor = modScore > 0.9 ? T.amber : modScore > 0.6 ? T.green : T.muted;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.bg }} className="fade-in">
      <PageHeader
        icon={GitBranch}
        title="Community Analysis"
        subtitle="Louvain-detected clusters — high isolation ratios indicate echo chambers"
        accent={T.purple}
        right={ov && (
          <div style={{ textAlign: 'center', background: 'rgba(167,139,250,0.09)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: 10, padding: '10px 20px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: T.text }}>{modScore.toFixed(3)}</div>
            <div style={{ fontSize: 11, color: T.xdim, marginTop: 2 }}>Modularity Q</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: modColor, marginTop: 3 }}>{modLabel}</div>
          </div>
        )}
      />

      <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1440 }}>

        {/* Echo chamber alert */}
        {echoChambers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 20px', borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)' }}>
            <AlertTriangle size={16} style={{ color: T.red, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.red }}>
                {echoChambers.length} echo chamber{echoChambers.length > 1 ? 's' : ''} detected
              </div>
              <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.7)', marginTop: 4, lineHeight: 1.5 }}>
                These communities show extreme internal density with minimal external connections — a strong indicator of coordinated amplification or ideological isolation.
              </p>
            </div>
          </div>
        )}

        {/* Community grid */}
        {communities.length === 0 ? (
          <EmptyState icon={GitBranch} title="No community data" message="The API server needs to be running and analysis must be executed first." color={T.purple} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {communities.map((c: any) => {
              const cc = communityColor(c.community_id);
              const isEcho = echoIds.has(c.community_id);
              const total = (c.internal_edges ?? 0) + (c.external_edges ?? 0);
              const iso   = total > 0 ? (c.internal_edges ?? 0) / total : 0;
              const isoColor = iso > 0.85 ? T.red : iso > 0.6 ? T.amber : cc;
              const topAgts = nodes
                .filter(n => n.community_id === c.community_id)
                .sort((a, b) => (b.pagerank ?? 0) - (a.pagerank ?? 0))
                .slice(0, 3);

              return (
                <div key={c.community_id} style={{ ...card(), overflow: 'hidden' }}>
                  {/* Color top bar */}
                  <div style={{ height: 3, background: cc }} />

                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: `${cc}18`, color: cc }}>
                        #{c.community_id}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Community {c.community_id}</span>
                    </div>
                    {isEcho && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: T.red }}>
                        ⚠ Echo
                      </span>
                    )}
                  </div>

                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ background: T.elevated, borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: T.text }}>{c.member_count}</div>
                        <div style={{ fontSize: 11, color: T.xdim, marginTop: 2 }}>members</div>
                      </div>
                      <div style={{ background: T.elevated, borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: isoColor }}>{Math.round(iso * 100)}%</div>
                        <div style={{ fontSize: 11, color: T.xdim, marginTop: 2 }}>isolation</div>
                      </div>
                    </div>

                    {/* Isolation bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.xdim, marginBottom: 6 }}>
                        <span>Internal connectivity</span>
                        <span>{c.internal_edges ?? '?'} int / {c.external_edges ?? '?'} ext</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: T.elevated, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${iso * 100}%`, background: isoColor, borderRadius: 99 }} />
                      </div>
                    </div>

                    {/* Top agents */}
                    {topAgts.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.xdim, marginBottom: 8 }}>
                          Top influencers
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {topAgts.map(a => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: cc, flexShrink: 0, display: 'inline-block' }} />
                                <span style={{ fontSize: 13, fontFamily: 'monospace', color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                              </div>
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.xdim, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {a.pagerank?.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Distribution Metrics */}
        <div style={{ ...card(), overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${T.border}` }}>
            <div><SectionLabel icon={BarChart3} color={T.cyan}>Distribution Metrics</SectionLabel></div>
          </div>
          <div style={{ minHeight: 360 }}>
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
