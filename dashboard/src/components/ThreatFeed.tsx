import { useThreats } from '../hooks/useAnalysis';
import { SEVERITY_BORDER, SEVERITY_BG, THREAT_COLORS } from '../lib/colors';
import type { ThreatItem } from '../types';
import { ShieldAlert, Users, Activity } from 'lucide-react';

// New zinc design tokens
const T = {
  bg:       '#0a0a0c',
  card:     '#1a1a1f',
  elevated: '#222228',
  border:   'rgba(255,255,255,0.07)',
  borderMd: 'rgba(255,255,255,0.13)',
  text:     '#f2f2f5',
  muted:    '#9b9baa',
  dim:      '#6b6b7a',
  xdim:     '#46464f',
  orange:   '#f97316',
  cyan:     '#22d3ee',
  red:      '#ef4444',
};

interface ThreatFeedProps {
  onInvestigate?: (agentIds: string[]) => void;
  onSelectAgent?: (agentId: string) => void;
  selectedAgentId?: string | null;
  highlightedAgentIds?: string[];
  compact?: boolean;
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function ThreatCard({
  item, onInvestigate, onSelectAgent, selectedAgentId, highlightedAgentIds = [], compact,
}: {
  item: ThreatItem;
  onInvestigate?: (ids: string[]) => void;
  onSelectAgent?: (agentId: string) => void;
  selectedAgentId?: string | null;
  highlightedAgentIds?: string[];
  compact?: boolean;
}) {
  const severity     = item.severity as keyof typeof SEVERITY_BG;
  const badgeCls     = SEVERITY_BG[severity] || SEVERITY_BG.MEDIUM;
  const borderColor  = SEVERITY_BORDER[severity] || THREAT_COLORS.MEDIUM;
  const agents       = item.agent_ids || (item as { agents?: string[] }).agents || [];
  const score        = item.coordination_score;
  const isSelected   = !!selectedAgentId && agents.includes(selectedAgentId);
  const isHighlighted = highlightedAgentIds.some(id => agents.includes(id));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', borderRadius: 10, transition: 'border-color 0.15s',
      background: T.card,
      border: `1px solid ${isSelected ? 'rgba(249,115,22,0.4)' : isHighlighted ? 'rgba(249,115,22,0.18)' : T.border}`,
      borderLeft: `3px solid ${borderColor}`,
      boxShadow: isSelected ? '0 0 0 1px rgba(249,115,22,0.1)' : 'none',
    }}>
      <div style={{ padding: compact ? '12px 14px' : '14px 16px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${badgeCls}`}>
                {item.severity}
              </span>
              <span style={{
                fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 6,
                background: T.elevated, border: `1px solid ${T.border}`, color: T.muted,
              }}>
                {(item.threat_type || (item as { type?: string }).type || '').replace(/_/g, ' ')}
              </span>
            </div>
            {score !== undefined && (
              <span style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0, color: T.xdim }}>
                {Math.round(score * 100)}%
              </span>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p style={{
              fontSize: 12, lineHeight: 1.5, marginBottom: 10, color: T.muted,
              display: '-webkit-box', WebkitLineClamp: compact ? 2 : 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {item.description}
            </p>
          )}

          {/* Coordination score bar (non-compact) */}
          {score !== undefined && !compact && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.xdim, marginBottom: 5 }}>
                <span>Coordination</span>
                <span style={{ fontFamily: 'monospace' }}>{Math.round(score * 100)}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 99, background: T.elevated, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score * 100}%`, background: borderColor, borderRadius: 99 }} />
              </div>
            </div>
          )}

          {/* Agent chips */}
          {agents.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <Users size={11} style={{ color: T.xdim, flexShrink: 0 }} />
              {agents.slice(0, compact ? 4 : 6).map((id: string) => (
                <button
                  key={id}
                  onClick={() => onSelectAgent?.(id)}
                  style={{
                    fontSize: 11, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 5,
                    background: T.elevated, border: `1px solid ${T.border}`, color: T.muted,
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = T.orange;
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,115,22,0.35)';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = T.muted;
                    (e.currentTarget as HTMLElement).style.borderColor = T.border;
                    (e.currentTarget as HTMLElement).style.background = T.elevated;
                  }}
                >
                  {id.length > 14 ? id.slice(0, 14) + '…' : id}
                </button>
              ))}
              {agents.length > (compact ? 4 : 6) && (
                <span style={{ fontSize: 11, color: T.xdim }}>+{agents.length - (compact ? 4 : 6)}</span>
              )}
            </div>
          )}

          {/* Evidence + submolts (non-compact) */}
          {!compact && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {item.evidence_types?.map(e => (
                <span key={e} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 5,
                  background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.18)', color: T.cyan,
                }}>
                  {e.replace(/_/g, ' ')}
                </span>
              ))}
              {item.submolts?.slice(0, 3).map(s => (
                <span key={s} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 5,
                  background: T.elevated, border: `1px solid ${T.border}`, color: T.muted,
                }}>
                  m/{s}
                </span>
              ))}
            </div>
          )}
        </div>

      {/* Show in graph button */}
      {onInvestigate && agents.length > 0 && (
        <button
          onClick={() => onInvestigate(agents)}
          style={{
            width: '100%', padding: '9px 14px', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'rgba(249,115,22,0.06)', borderTop: `1px solid ${T.border}`,
            color: T.orange, cursor: 'pointer', transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.12)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,115,22,0.06)'; }}
        >
          <ShieldAlert size={12} /> Show in graph
        </button>
      )}
    </div>
  );
}

export function ThreatFeed({
  onInvestigate, onSelectAgent, selectedAgentId, highlightedAgentIds = [], compact,
}: ThreatFeedProps) {
  const { threats, anomalies, loading } = useThreats(30_000);
  const all = [
    ...threats.map(t  => ({ ...t, _category: 'campaign' })),
    ...anomalies.map(a => ({ ...a, _category: 'anomaly'  })),
  ].sort((a, b) =>
    (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 2) -
    (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 2),
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: T.dim, fontSize: 13 }}>
        <Activity size={14} className="animate-pulse" style={{ color: T.orange }} />
        Loading threats…
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <ShieldAlert size={20} style={{ color: '#22c55e', opacity: 0.7 }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.muted }}>No active threats</div>
          <div style={{ fontSize: 12, color: T.xdim, marginTop: 3 }}>Network looks clean in current snapshot</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={14} style={{ color: T.red }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Active Threats</span>
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: T.xdim }}>({all.length})</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['CRITICAL', 'HIGH', 'MEDIUM'] as const).map(sev => {
              const cnt = all.filter(t => t.severity === sev).length;
              if (!cnt) return null;
              return <span key={sev} className={`text-xs font-bold px-2 py-1 rounded-md border ${SEVERITY_BG[sev]}`}>{cnt} {sev}</span>;
            })}
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {all.map(item => (
          <ThreatCard
            key={item.id}
            item={item}
            onInvestigate={onInvestigate}
            onSelectAgent={onSelectAgent}
            selectedAgentId={selectedAgentId}
            highlightedAgentIds={highlightedAgentIds}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}
