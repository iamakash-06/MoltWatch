import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Network, AlertTriangle, Users, GitBranch } from 'lucide-react';
import { useNetworkOverview } from '../hooks/useGraphData';
import { useThreats } from '../hooks/useAnalysis';

const navItems = [
  { to: '/',            label: 'Overview',       icon: LayoutDashboard, exact: true  },
  { to: '/graph',       label: 'Graph Explorer', icon: Network,         exact: false },
  { to: '/threats',     label: 'Threats',        icon: AlertTriangle,   exact: false, badge: true },
  { to: '/agents',      label: 'Agents',         icon: Users,           exact: false },
  { to: '/communities', label: 'Communities',    icon: GitBranch,       exact: false },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { data: overview } = useNetworkOverview();
  const { threats, anomalies } = useThreats(30000);
  const threatCount = threats.length + anomalies.length;
  const criticalCount = [...threats, ...anomalies].filter(
    (t) => t.severity === 'CRITICAL' || t.severity === 'HIGH',
  ).length;

  return (
    <div className="flex h-screen min-h-0 overflow-hidden text-[var(--text)]" style={{ background: 'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside
        className="w-64 shrink-0 flex flex-col"
        style={{ background: '#0b1221', borderRight: '1px solid #1c2e44' }}
      >
        {/* Brand */}
        <div className="px-5 py-6" style={{ borderBottom: '1px solid #1c2e44' }}>
          <div className="flex items-center gap-3.5">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,0.25), rgba(185,28,28,0.3))',
                border: '1px solid rgba(249,115,22,0.35)',
                boxShadow: '0 0 18px rgba(249,115,22,0.18)',
              }}
            >
              🦞
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white leading-none">MoltWatch</div>
              <div className="text-xs mt-1 leading-none" style={{ color: '#8090a8' }}>
                Agent Network Intelligence
              </div>
            </div>
          </div>
        </div>

        {/* Live network status */}
        {overview && (
          <div
            className="mx-4 mt-4 px-4 py-3 rounded-xl"
            style={{ background: '#0e1625', border: '1px solid #1c2e44' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.7)' }}
              />
              <span className="text-xs font-semibold" style={{ color: '#34d399' }}>Live</span>
              <span className="ml-auto text-xs" style={{ color: '#3d5068' }}>Snapshot</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Agents',   value: (overview as any).agents?.toLocaleString(),        color: '#dde4f0' },
                { label: 'Clusters', value: String((overview as any).community_count ?? '—'),  color: '#22d3ee' },
                { label: 'Edges',    value: (overview as any).reply_edges?.toLocaleString(),   color: '#8090a8' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: '#8090a8' }}>{label}</span>
                  <span className="text-sm font-mono font-semibold" style={{ color }}>{value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critical alert banner */}
        {criticalCount > 0 && (
          <div
            className="mx-4 mt-3 px-4 py-3 rounded-xl flex items-center gap-2.5"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)' }}
          >
            <AlertTriangle size={13} style={{ color: '#f43f5e' }} className="shrink-0" />
            <span className="text-sm" style={{ color: '#fb7185' }}>
              {criticalCount} critical alert{criticalCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all border font-medium ${
                    isActive ? 'mw-nav-active' : 'mw-nav-idle'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                        background: 'rgba(34,211,238,0.07)',
                        border: '1px solid rgba(34,211,238,0.22)',
                        color: '#22d3ee',
                      }
                    : {
                        background: 'transparent',
                        border: '1px solid transparent',
                        color: '#8090a8',
                      }
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} style={{ color: isActive ? '#22d3ee' : '#3d5068' }} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && threatCount > 0 && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={
                          criticalCount > 0
                            ? { background: 'rgba(244,63,94,0.15)', color: '#f43f5e' }
                            : { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                        }
                      >
                        {threatCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer key metrics */}
        {overview && (
          <div
            className="px-5 py-4 space-y-2.5"
            style={{ borderTop: '1px solid #1c2e44' }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#3d5068' }}>
              Network Health
            </div>
            {[
              {
                label: 'Modularity',
                value: `Q = ${(overview as any).modularity?.toFixed(3) ?? '—'}`,
                hint: ((overview as any).modularity ?? 0) > 0.9 ? '⚠ Echo risk' : 'Normal',
                hintColor: ((overview as any).modularity ?? 0) > 0.9 ? '#fbbf24' : '#34d399',
              },
              {
                label: 'Karma Gini',
                value: `${Math.round(((overview as any).gini_karma ?? 0) * 100)}%`,
                hint: 'Engagement inequality',
                hintColor: '#3d5068',
              },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs" style={{ color: '#3d5068' }}>{s.label}</span>
                  <span className="text-xs font-mono font-semibold" style={{ color: '#8090a8' }}>{s.value}</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: s.hintColor }}>{s.hint}</div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main
        className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col text-[var(--text)]"
        style={{ background: 'var(--bg)' }}
      >
        {children}
      </main>
    </div>
  );
}
