import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Network, ShieldAlert, Users, GitBranch, Zap } from 'lucide-react';
import { useThreats } from '../hooks/useAnalysis';

const NAV = [
  { to: '/',            icon: LayoutDashboard, label: 'Overview',       exact: true  },
  { to: '/graph',       icon: Network,         label: 'Graph Explorer'              },
  { to: '/threats',     icon: ShieldAlert,     label: 'Threats',        badge: true  },
  { to: '/agents',      icon: Users,           label: 'Agents'                      },
  { to: '/communities', icon: GitBranch,       label: 'Communities'                 },
] as const;

const S = {
  sidebar:    { width: 224, background: '#111115', borderRight: '1px solid rgba(255,255,255,0.07)' },
  logo:       { padding: '22px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  logoIcon:   {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
    background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(185,28,28,0.22))',
    border: '1px solid rgba(249,115,22,0.3)',
    boxShadow: '0 0 18px rgba(249,115,22,0.1)',
  },
  navItem: (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8, textDecoration: 'none',
    fontSize: 14, fontWeight: 500, transition: 'all 0.13s ease',
    background:  active ? 'rgba(249,115,22,0.11)'  : 'transparent',
    color:       active ? '#f97316' : '#9b9baa',
    borderLeft:  active ? '2px solid #f97316' : '2px solid transparent',
    cursor: 'pointer',
  }),
  navIcon: (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    color: active ? '#f97316' : '#6b6b7a',
    transition: 'color 0.13s',
  }),
  badge: (critical: boolean): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '-0.01em',
    padding: '1px 7px', borderRadius: 99,
    background: critical ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
    color:      critical ? '#ef4444' : '#f59e0b',
    border:     critical ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(245,158,11,0.25)',
  }),
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { threats, anomalies } = useThreats(30_000);
  const count    = threats.length + anomalies.length;
  const critical = [...threats, ...anomalies].filter(t => t.severity === 'CRITICAL' || t.severity === 'HIGH').length;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0a0c' }}>

      {/* ── Sidebar ── */}
      <aside style={{ ...S.sidebar, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Brand */}
        <div style={{ ...S.logo, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={S.logoIcon}>🦞</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f2f5', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              MoltWatch
            </div>
            <div style={{ fontSize: 11, color: '#46464f', marginTop: 3, lineHeight: 1 }}>
              Intelligence Platform
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', color: '#46464f', textTransform: 'uppercase', padding: '8px 12px 6px' }}>
            Navigation
          </div>
          {NAV.map(({ to, icon: Icon, label, exact, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              style={({ isActive }) => S.navItem(isActive)}
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} style={S.navIcon(isActive)} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  {badge && count > 0 && (
                    <span style={S.badge(critical > 0)}>{count}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#46464f' }}>Live snapshot</span>
          <span style={{ fontSize: 11, color: '#46464f', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>α 0.1</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
