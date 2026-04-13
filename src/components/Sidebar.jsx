import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/queue', label: 'Approval Queue', icon: '✅', badge: 'queue' },
  { to: '/tracker', label: 'Tracker', icon: '📋' },
  { to: '/sources', label: 'Sources', icon: '📡' },
  { to: '/import', label: 'Import', icon: '📥' },
];

export default function Sidebar() {
  const { state } = useApp();
  const queueCount = state.opportunities.filter(
    o => o.approval_state === 'pending' && !['rejected','ghosted','stale'].includes(o.status)
  ).length;

  return (
    <aside className="sidebar">
      <nav className="nav-section">
        <div className="nav-section-label">Navigate</div>
        {NAV.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
            {n.badge === 'queue' && queueCount > 0 && (
              <span className="nav-badge">{queueCount}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: '12px 16px' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', lineHeight: 1.6 }}>
          <div>{state.liveIntakeEnabled ? '🟢 Live intake ON' : '🔴 Live intake OFF'}</div>
          {state.demoMode && <div style={{ marginTop: 4 }}>Demo mode — no backend required</div>}
        </div>
      </div>
    </aside>
  );
}
