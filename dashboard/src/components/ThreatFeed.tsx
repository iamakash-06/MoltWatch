import { useThreats } from '../hooks/useAnalysis';
import { SEVERITY_BORDER, SEVERITY_BG, THREAT_COLORS } from '../lib/colors';
import type { ThreatItem } from '../types';
import { ShieldAlert, Users, Activity } from 'lucide-react';

const T = {
  card:     '#0e1625',
  elevated: '#132030',
  border:   '#1c2e44',
  text:     '#dde4f0',
  muted:    '#8090a8',
  dim:      '#3d5068',
  cyan:     '#22d3ee',
  danger:   '#f43f5e',
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
  item,
  onInvestigate,
  onSelectAgent,
  selectedAgentId,
  highlightedAgentIds = [],
  compact,
}: {
  item: ThreatItem;
  onInvestigate?: (ids: string[]) => void;
  onSelectAgent?: (agentId: string) => void;
  selectedAgentId?: string | null;
  highlightedAgentIds?: string[];
  compact?: boolean;
}) {
  const severity        = item.severity as keyof typeof SEVERITY_BG;
  const badgeCls        = SEVERITY_BG[severity] || SEVERITY_BG.MEDIUM;
  const borderColor     = SEVERITY_BORDER[severity] || THREAT_COLORS.MEDIUM;
  const agents          = item.agent_ids || (item as { agents?: string[] }).agents || [];
  const score           = item.coordination_score;
  const isSelectedRelated  = !!selectedAgentId && agents.includes(selectedAgentId);
  const isHighlightRelated = highlightedAgentIds.some((id) => agents.includes(id));

  return (
    <div
      className="flex rounded-xl overflow-hidden transition-all min-w-0"
      style={{
        background: T.card,
        border:     `1px solid ${isSelectedRelated ? 'rgba(34,211,238,0.4)' : isHighlightRelated ? 'rgba(34,211,238,0.2)' : T.border}`,
        boxShadow:  isSelectedRelated ? '0 0 0 1px rgba(34,211,238,0.15)' : 'none',
      }}
    >
      <div className="w-1 shrink-0 self-stretch" style={{ background: borderColor }} aria-hidden />
      <div className="flex flex-col flex-1 min-w-0">
      <div className="p-4 flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${badgeCls}`}>
              {item.severity}
            </span>
            <span
              className="text-xs font-mono px-2 py-1 rounded-lg"
              style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.muted }}
            >
              {(item.threat_type || (item as { type?: string }).type || '').replace(/_/g, ' ')}
            </span>
          </div>
          {score !== undefined && (
            <span className="text-xs font-mono shrink-0" style={{ color: T.dim }}>
              {Math.round(score * 100)}% match
            </span>
          )}
        </div>

        {/* Description */}
        {compact && item.description && (
          <p className="text-sm leading-relaxed mb-3 line-clamp-2" style={{ color: T.muted }}>
            {item.description}
          </p>
        )}
        {!compact && (
          <p className="text-sm leading-relaxed mb-3" style={{ color: T.text }}>
            {item.description}
          </p>
        )}

        {/* Coordination score bar */}
        {score !== undefined && !compact && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: T.dim }}>
              <span>Coordination score</span>
              <span className="font-mono">{Math.round(score * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.elevated }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${score * 100}%`, background: borderColor }}
              />
            </div>
          </div>
        )}

        {/* Agent chips */}
        {agents.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Users size={11} className="shrink-0" style={{ color: T.dim }} />
            {agents.slice(0, compact ? 5 : 6).map((id: string) => (
              <button
                key={id}
                onClick={() => onSelectAgent?.(id)}
                className="text-xs font-mono px-2 py-0.5 rounded-lg transition-all"
                style={{
                  background: T.elevated,
                  border:     `1px solid ${T.border}`,
                  color:      T.muted,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color      = T.cyan;
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,211,238,0.4)';
                  (e.currentTarget as HTMLElement).style.background  = 'rgba(34,211,238,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color      = T.muted;
                  (e.currentTarget as HTMLElement).style.borderColor = T.border;
                  (e.currentTarget as HTMLElement).style.background  = T.elevated;
                }}
              >
                {id.length > 14 ? id.slice(0, 14) + '…' : id}
              </button>
            ))}
            {agents.length > (compact ? 5 : 6) && (
              <span className="text-xs" style={{ color: T.dim }}>
                +{agents.length - (compact ? 5 : 6)}
              </span>
            )}
          </div>
        )}

        {/* Evidence tags */}
        {!compact && item.evidence_types && item.evidence_types.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {item.evidence_types.map((e) => (
              <span
                key={e}
                className="text-xs px-2 py-0.5 rounded-lg"
                style={{
                  background: 'rgba(34,211,238,0.07)',
                  border:     '1px solid rgba(34,211,238,0.2)',
                  color:      T.cyan,
                }}
              >
                {e.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Submolts */}
        {!compact && item.submolts && item.submolts.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {item.submolts.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-xs px-2 py-0.5 rounded-lg"
                style={{ background: T.elevated, border: `1px solid ${T.border}`, color: T.muted }}
              >
                m/{s}
              </span>
            ))}
          </div>
        )}
      </div>

      {onInvestigate && agents.length > 0 && (
        <button
          onClick={() => onInvestigate(agents)}
          className="w-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all shrink-0"
          style={{
            background:  'rgba(34,211,238,0.05)',
            borderTop:   `1px solid ${T.border}`,
            color:       T.cyan,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(34,211,238,0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(34,211,238,0.05)';
          }}
        >
          <ShieldAlert size={13} /> Show in graph
        </button>
      )}
      </div>
    </div>
  );
}

export function ThreatFeed({
  onInvestigate,
  onSelectAgent,
  selectedAgentId,
  highlightedAgentIds = [],
  compact,
}: ThreatFeedProps) {
  const { threats, anomalies, loading } = useThreats(30000);
  const all = [
    ...threats.map((t)  => ({ ...t, _category: 'campaign' })),
    ...anomalies.map((a) => ({ ...a, _category: 'anomaly'  })),
  ].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 2) -
      (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 2),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm" style={{ color: T.dim }}>
        <Activity size={14} className="animate-pulse" style={{ color: T.cyan }} />
        Loading threats…
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.18)' }}
        >
          <ShieldAlert size={20} style={{ color: T.cyan, opacity: 0.6 }} />
        </div>
        <p className="text-sm" style={{ color: T.dim }}>No active threats detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!compact && (
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} style={{ color: T.danger }} />
            <span className="text-sm font-semibold text-white">Active Threats</span>
          </div>
          <div className="flex gap-1.5">
            {(['CRITICAL', 'HIGH', 'MEDIUM'] as const).map((sev) => {
              const count = all.filter((t) => t.severity === sev).length;
              if (!count) return null;
              return (
                <span key={sev} className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${SEVERITY_BG[sev]}`}>
                  {count} {sev}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {!compact && (
        <p className="text-xs mb-4 leading-relaxed" style={{ color: T.dim }}>
          Click an agent chip to open profile. Use "Show in graph" to highlight suspected members.
        </p>
      )}
      <div className="flex-1 overflow-y-auto space-y-3">
        {all.map((item) => (
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
