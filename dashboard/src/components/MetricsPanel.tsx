import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../lib/api';
import { useNetworkOverview } from '../hooks/useGraphData';
import { COMMUNITY_PALETTE } from '../lib/colors';
import { TrendingUp, Users, Layers, GitBranch } from 'lucide-react';

const T = {
  card:     '#0e1625',
  elevated: '#132030',
  border:   '#1c2e44',
  text:     '#dde4f0',
  muted:    '#8090a8',
  dim:      '#3d5068',
  cyan:     '#22d3ee',
  danger:   '#f43f5e',
  warning:  '#fbbf24',
  success:  '#34d399',
};

interface GiniBarProps {
  label: string;
  value: number;
  benchmark?: number;
  color: string;
}

function GiniBar({ label, value, benchmark, color }: GiniBarProps) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span style={{ color: T.muted }}>{label}</span>
        <div className="flex items-center gap-2">
          {benchmark && (
            <span className="text-xs" style={{ color: T.dim }}>
              bench {Math.round(benchmark * 100)}%
            </span>
          )}
          <span className="font-mono font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: T.elevated }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
        {benchmark && (
          <div
            className="absolute inset-y-0 w-0.5 rounded-full"
            style={{ left: `${Math.round(benchmark * 100)}%`, background: T.muted, opacity: 0.5 }}
          />
        )}
      </div>
    </div>
  );
}

export function MetricsPanel() {
  const { data: overview } = useNetworkOverview();
  const [gini, setGini]               = useState<Record<string, number> | null>(null);
  const [communities, setCommunities] = useState<{ community_id: number; member_count: number }[]>([]);

  useEffect(() => {
    api.analysis.gini().then((d) => setGini(d as Record<string, number>));
    api.analysis.communities().then((d) => {
      const res = d as { communities: { community_id: number; member_count: number }[] };
      setCommunities(res.communities?.slice(0, 20) || []);
    });
  }, []);

  const modColor = overview?.modularity
    ? overview.modularity > 0.9 ? T.danger  : overview.modularity > 0.6 ? T.warning : T.success
    : T.dim;

  const giniColor = (v: number) => v > 0.9 ? T.danger : v > 0.7 ? T.warning : T.success;

  const sectionHeader = {
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    fontSize:     11,
    fontWeight:   700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color:        T.cyan,
    marginBottom: 12,
  };

  return (
    <div className="space-y-5 p-5 overflow-y-auto h-full min-w-0" style={{ background: T.card }}>

      {/* Network scale */}
      {overview && (
        <div>
          <div style={sectionHeader}>
            <Users size={11} /> Network Scale
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Agents',       value: (overview as any).agents?.toLocaleString()        },
              { label: 'Submolts',     value: (overview as any).submolts?.toLocaleString()      },
              { label: 'Reply Edges',  value: (overview as any).reply_edges?.toLocaleString()   },
              { label: 'Communities',  value: String((overview as any).community_count ?? '—')  },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl p-3.5"
                style={{ background: T.elevated, border: `1px solid ${T.border}` }}
              >
                <div className="text-lg font-bold font-mono text-white">{item.value ?? '—'}</div>
                <div className="text-xs mt-0.5" style={{ color: T.dim }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Modularity */}
          <div
            className="mt-3 rounded-xl p-4"
            style={{ background: T.elevated, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm flex items-center gap-1.5" style={{ color: T.muted }}>
                <Layers size={12} /> Louvain Modularity Q
              </span>
              <span className="text-lg font-bold font-mono" style={{ color: modColor }}>
                {(overview as any).modularity?.toFixed(3) ?? '—'}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${((overview as any).modularity ?? 0) * 100}%`, background: modColor }}
              />
            </div>
            <div className="text-xs mt-2" style={{ color: T.dim }}>
              {((overview as any).modularity ?? 0) > 0.9
                ? '⚠ Extreme clustering — echo chamber risk'
                : ((overview as any).modularity ?? 0) > 0.6
                  ? '⚡ Strong community structure'
                  : '✓ Moderate clustering'}
            </div>
          </div>
        </div>
      )}

      {/* Gini coefficients */}
      {gini && (
        <div>
          <div style={sectionHeader}>
            <TrendingUp size={11} /> Inequality (Gini)
          </div>
          <div className="space-y-3">
            <GiniBar
              label="Karma"
              value={gini.karma ?? 0}
              benchmark={0.99}
              color={giniColor(gini.karma ?? 0)}
            />
            <GiniBar
              label="PageRank"
              value={gini.pagerank ?? 0}
              color={giniColor(gini.pagerank ?? 0)}
            />
            <GiniBar
              label="Post Count"
              value={gini.post_count ?? 0}
              benchmark={0.60}
              color={giniColor(gini.post_count ?? 0)}
            />
          </div>
          <p className="text-xs mt-3 leading-relaxed" style={{ color: T.dim }}>
            Vertical bar = Moltbook benchmark. Higher = more unequal distribution.
          </p>
        </div>
      )}

      {/* Community size distribution */}
      {communities.length > 0 && (
        <div>
          <div style={sectionHeader}>
            <GitBranch size={11} /> Community Sizes
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart
              data={communities}
              margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
              barSize={16}
            >
              <XAxis dataKey="community_id" hide />
              <YAxis tick={{ fontSize: 10, fill: T.dim }} />
              <Tooltip
                contentStyle={{
                  background:   T.card,
                  border:       `1px solid ${T.border}`,
                  borderRadius: 12,
                  fontSize:     12,
                }}
                labelFormatter={(v) => `Community #${v}`}
                itemStyle={{ color: T.text }}
                formatter={(v) => [`${Number(v)} agents`, 'Members']}
              />
              <Bar dataKey="member_count" radius={[4, 4, 0, 0]}>
                {communities.map((c, i) => (
                  <Cell
                    key={i}
                    fill={COMMUNITY_PALETTE[c.community_id % COMMUNITY_PALETTE.length]}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs mt-2" style={{ color: T.dim }}>
            Each bar = one community, colored by community ID.
          </p>
        </div>
      )}
    </div>
  );
}
