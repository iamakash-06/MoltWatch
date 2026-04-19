import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { trustColor, communityColor } from '../lib/colors';
import type { AgentProfile } from '../types';
import { X, Activity, Shield, Zap, Users } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

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
  cyan:     '#22d3ee',
  danger:   '#ef4444',
  warning:  '#f59e0b',
  success:  '#22c55e',
};

interface AgentDetailProps {
  agentId: string | null;
  onClose?: () => void;
}

export function AgentDetail({ agentId, onClose }: AgentDetailProps) {
  const [agent, setAgent]                 = useState<AgentProfile | null>(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [timeline, setTimeline]           = useState<{ created_at?: string }[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!agentId) { setAgent(null); setError(null); setTimeline([]); return; }
    setLoading(true); setError(null); setAgent(null);
    api.agents.get(agentId)
      .then((d) => { if (!active) return; setAgent(d as AgentProfile); })
      .catch((e: Error) => { if (!active) return; setError(e.message || 'Failed to load'); })
      .finally(() => { if (!active) return; setLoading(false); });
    return () => { active = false; };
  }, [agentId]);

  useEffect(() => {
    let active = true;
    if (!agent?.id) { setTimeline([]); return; }
    setTimelineLoading(true);
    api.agents.timeline(agent.id)
      .then((d) => {
        if (!active) return;
        const posts = ((d as { posts?: { created_at?: string }[] }).posts ?? []);
        setTimeline(posts);
      })
      .catch(() => { if (!active) return; setTimeline([]); })
      .finally(() => { if (!active) return; setTimelineLoading(false); });
    return () => { active = false; };
  }, [agent?.id]);

  const timelineSeries = useMemo(() => {
    if (!timeline.length) return [];
    const counts = new Map<string, number>();
    for (const post of timeline) {
      if (!post.created_at) continue;
      const day = post.created_at.slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, posts]) => ({ day: day.slice(5), posts }));
  }, [timeline]);

  // ── Empty state ──
  if (!agentId) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[14rem] gap-4 px-8 text-center"
        style={{ background: T.card }}
      >
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.18)' }}
        >
          <Users size={24} style={{ color: T.orange, opacity: 0.6 }} />
        </div>
        <p className="text-sm leading-relaxed" style={{ color: T.muted }}>
          Select an agent node to open their investigation profile.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-[14rem] gap-3"
        style={{ background: T.card, color: T.dim }}
      >
        <Activity size={15} className="animate-pulse" style={{ color: T.orange }} />
        <span className="text-sm">Loading profile…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3" style={{ background: T.card }}>
        <div className="text-sm font-semibold" style={{ color: T.danger }}>Failed to load agent profile</div>
        <div className="text-xs font-mono break-all" style={{ color: 'rgba(244,63,94,0.6)' }}>{error}</div>
        <div className="text-xs" style={{ color: T.dim }}>
          This usually happens when the selected node doesn't resolve to a valid agent id.
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 text-sm" style={{ background: T.card, color: T.dim }}>
        Agent not found
      </div>
    );
  }

  const trust        = agent.trust;
  const heartbeat    = agent.heartbeat;
  const trustScore   = trust?.trust_score ?? 0;
  const tColor       = trustColor(trustScore);
  const cColor       = communityColor(agent.community_id);
  const isAutonomous = heartbeat?.is_regular !== false && (heartbeat?.cov ?? agent.cov_score ?? 0.5) <= 1.0;

  return (
    <div className="flex flex-col min-h-0" style={{ background: T.card }}>

      {/* ── Header ── */}
      <div
        className="flex items-start justify-between px-5 pt-5 pb-4 shrink-0"
        style={{ borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
            style={{
              background: `${cColor}18`,
              color:      cColor,
              border:     `1px solid ${cColor}35`,
            }}
          >
            {agent.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <h2 className="font-mono text-base font-bold leading-tight" style={{ color: T.text }}>{agent.name}</h2>
            <div className="text-xs font-mono mt-1" style={{ color: T.dim }}>{agent.id}</div>
            <div className="text-xs mt-1" style={{ color: T.muted }}>Trust & behavioral fingerprint</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all shrink-0"
            style={{ color: T.dim }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = T.orange; (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.08)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = T.dim; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-5 space-y-5 pb-8">

        {/* Trust score card */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: `${tColor}0a`, border: `1px solid ${tColor}28` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} style={{ color: tColor }} />
              <span className="text-sm font-semibold" style={{ color: T.text }}>Trust Score</span>
            </div>
            <span className="text-2xl font-bold font-mono" style={{ color: tColor }}>
              {Math.round(trustScore)}
            </span>
          </div>

          <div className="h-2 rounded-full overflow-hidden" style={{ background: T.elevated }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${trustScore}%`, background: tColor }}
            />
          </div>

          {trust?.behavioral_class && (
            <div className="text-sm" style={{ color: T.muted }}>
              {isAutonomous ? '🤖 Autonomous' : '👤 Human-driven'}
              {' · '}behavior: {trust.behavioral_class.replace(/_/g, ' ')}
            </div>
          )}

          <div className="text-xs leading-relaxed" style={{ color: T.dim }}>
            Combines regularity, reciprocity, account age, and cluster risk.
          </div>

          {trust?.risk_flags && trust.risk_flags.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 pt-3"
              style={{ borderTop: `1px solid ${T.border}` }}
            >
              {trust.risk_flags.map((f) => (
                <span
                  key={f}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium"
                  style={{ background: 'rgba(244,63,94,0.12)', color: T.danger, border: '1px solid rgba(244,63,94,0.25)' }}
                >
                  ⚠ {f.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: 'Karma',     value: agent.karma?.toLocaleString() ?? '—',                          color: undefined as string | undefined },
            { label: 'Community', value: agent.community_id !== undefined ? `#${agent.community_id}` : '—', color: cColor },
            { label: 'In-degree', value: String(agent.in_degree ?? '—'),                               color: undefined as string | undefined },
            { label: 'Out-degree',value: String(agent.out_degree ?? '—'),                              color: undefined as string | undefined },
            { label: 'PageRank',  value: agent.pagerank?.toFixed(4) ?? '—',                            color: T.cyan  },
            { label: 'CoV',       value: (heartbeat?.cov ?? agent.cov_score)?.toFixed(3) ?? '—',      color: undefined as string | undefined },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-3.5"
              style={{ background: T.elevated, border: `1px solid ${T.border}` }}
            >
              <div className="text-xs mb-1.5" style={{ color: T.dim }}>{m.label}</div>
              <div className="text-sm font-mono font-bold" style={{ color: m.color ?? T.text }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Heartbeat */}
        {heartbeat && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: T.elevated, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-2">
              <Zap size={13} style={{ color: isAutonomous ? T.success : T.warning }} />
              <span className="text-sm font-semibold" style={{ color: T.text }}>Heartbeat Fingerprint</span>
            </div>
            <div className="space-y-2.5">
              {heartbeat.estimated_interval_minutes && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: T.muted }}>Post interval</span>
                  <span className="font-mono" style={{ color: T.text }}>
                    ~{heartbeat.estimated_interval_minutes} min
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: T.muted }}>Regularity</span>
                <span className="font-semibold" style={{ color: isAutonomous ? T.success : T.warning }}>
                  {isAutonomous ? '✓ Regular (bot-like)' : '⚡ Irregular (human)'}
                </span>
              </div>
              {heartbeat.cov !== undefined && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: T.muted }}>CoV score</span>
                  <span className="font-mono font-semibold" style={{ color: heartbeat.cov <= 1 ? T.success : T.warning }}>
                    {heartbeat.cov.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: T.dim }}>
              CoV ≤ 1.0 suggests scheduled/bot-like posting behaviour.
            </div>
          </div>
        )}

        {/* Activity timeline chart */}
        <div
          className="rounded-xl p-4"
          style={{ background: T.elevated, border: `1px solid ${T.border}` }}
        >
          <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: T.dim }}>
            Posting Activity
          </div>
          {timelineLoading ? (
            <div className="text-sm" style={{ color: T.dim }}>Loading…</div>
          ) : timelineSeries.length > 1 ? (
            <div style={{ height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineSeries}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: T.dim, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: T.card,
                      border:     `1px solid ${T.border}`,
                      borderRadius: 10,
                    }}
                    labelStyle={{ color: T.muted, fontSize: 11 }}
                    itemStyle={{ color: T.text, fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="posts"
                    stroke={cColor}
                    fill={cColor}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm" style={{ color: T.dim }}>Not enough timeline data</div>
          )}
        </div>

        {/* Submolts */}
        {agent.submolts && agent.submolts.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: T.dim }}>
              Active in Submolts
            </div>
            <div className="flex flex-wrap gap-2">
              {agent.submolts.map((s) => (
                <span
                  key={s}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.text }}
                >
                  m/{s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top interactions */}
        {agent.top_interactions && agent.top_interactions.length > 0 && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: T.dim }}>
              Frequent Interactions
            </div>
            <div className="space-y-2">
              {agent.top_interactions.slice(0, 5).map((interaction, idx) => (
                <div key={interaction.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono w-4 text-right" style={{ color: T.dim }}>{idx + 1}</span>
                    <span className="font-mono" style={{ color: T.text }}>{interaction.name}</span>
                  </div>
                  <span className="text-xs font-mono" style={{ color: T.dim }}>{interaction.interactions}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust components */}
        {trust?.components && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: T.dim }}>
              Trust Components
            </div>
            <div className="space-y-3">
              {Object.entries(trust.components).map(([k, v]) => {
                const vColor = v >= 70 ? T.success : v >= 40 ? T.warning : T.danger;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span style={{ color: T.muted }}>{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono font-semibold" style={{ color: vColor }}>{Math.round(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${v}%`, background: vColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
