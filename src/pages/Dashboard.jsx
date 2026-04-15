import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import OpportunityCard from '../components/OpportunityCard.jsx';
import QuickAddWidget from '../components/QuickAddWidget.jsx';
import { approveOpportunity } from '../lib/api.js';

export default function Dashboard() {
  const { state, dispatch, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const { opportunities: opps, logs, sources, demoMode } = state;

  const stats = useMemo(() => ({
    queue: opps.filter(o => o.approval_state === 'pending' && !['rejected','ghosted','stale'].includes(o.status)).length,
    discovered: opps.filter(o => o.status === 'discovered').length,
    active: opps.filter(o => ['approved','applied','interviewing','offer'].includes(o.status)).length,
    stale: opps.filter(o => o.stale_flag || o.isStale || o.isGhosted).length,
  }), [opps]);

  const highFit = useMemo(() =>
    opps.filter(o => o.recommended && !['rejected','ghosted'].includes(o.status))
      .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
      .slice(0, 4),
  [opps]);

  const nextActions = useMemo(() =>
    opps
      .filter(o => o.next_action_due && !['rejected','ghosted'].includes(o.status))
      .sort((a, b) => new Date(a.next_action_due) - new Date(b.next_action_due))
      .slice(0, 4),
  [opps]);

  const recentLogs = useMemo(() => (logs || []).slice(0, 5), [logs]);

  const handleApprove = async (opp) => {
    try {
      await approveOpportunity(opp.id, 'approve', '');
      await loadOpportunities();
      notify('Opportunity approved.', 'success');
    } catch (e) { notify(e.message, 'error'); }
  };

  const handleReject = async (opp) => {
    try {
      await approveOpportunity(opp.id, 'reject', 'Rejected from dashboard.');
      await loadOpportunities();
      notify('Opportunity rejected.', 'info');
    } catch (e) { notify(e.message, 'error'); }
  };

  return (
    <div>
      <h1 className="section-title">Dashboard</h1>
      <p className="section-sub">
        Approval-based job search OS · {demoMode ? 'Demo mode — no backend required' : 'Live mode'}
      </p>

      {/* Quick Add Widget */}
      <QuickAddWidget />

      {/* Stats Row */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          { value: stats.queue, label: 'Pending Approval', sub: 'Need review', action: () => nav('/queue'), color: 'var(--amber)' },
          { value: stats.discovered, label: 'Discovered', sub: 'Awaiting scoring review' },
          { value: stats.active, label: 'In Progress', sub: 'Approved / applied / interviewing', color: 'var(--green)' },
          { value: stats.stale, label: 'Stale / Ghosted', sub: 'Need follow-up or close', color: stats.stale > 0 ? 'var(--red)' : undefined },
        ].map((s, i) => (
          <div key={i} className="card stat-card" style={{ cursor: s.action ? 'pointer' : 'default' }} onClick={s.action}>
            <div className="stat-card__value" style={s.color ? { color: s.color } : {}}>{s.value}</div>
            <div className="stat-card__label">{s.label}</div>
            <div className="stat-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* High Fit Recommendations */}
        <div className="card">
          <div className="card-header">
            <h2>⭐ Strongest Fit</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/queue')}>See all</button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {highFit.length === 0 && <div className="text-muted text-sm">No high-fit opportunities yet.</div>}
            {highFit.map(o => (
              <OpportunityCard key={o.id} opp={o} onApprove={handleApprove} onReject={handleReject} showActions />
            ))}
          </div>
        </div>

        {/* Next Actions */}
        <div className="card">
          <div className="card-header">
            <h2>⏰ Next Actions Due</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/tracker')}>See tracker</button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nextActions.length === 0 && <div className="text-muted text-sm">No pending actions.</div>}
            {nextActions.map(o => (
              <div key={o.id} className="flex items-center gap-2" style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-medium truncate" style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => nav(`/opportunity/${o.id}`)}>{o.title}</div>
                  <div className="text-muted text-sm">{o.next_action}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{o.next_action_due}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ingestion Activity */}
      <div className="card">
        <div className="card-header">
          <h2>📡 Recent Ingestion Activity</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/sources')}>All sources</button>
        </div>
        <div className="card-body">
          {recentLogs.length === 0 && <div className="text-muted text-sm">No ingestion activity yet.</div>}
          {recentLogs.map(log => (
            <div key={log.id} className="flex items-center gap-2" style={{ padding: '7px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
              <span style={{ color: log.status === 'failure' ? 'var(--red)' : log.status === 'partial' ? 'var(--amber)' : 'var(--green)', fontSize: 16 }}>
                {log.status === 'failure' ? '✗' : log.status === 'partial' ? '⚠' : '✓'}
              </span>
              <span className="font-medium truncate" style={{ flex: 1 }}>{log.source_id}</span>
              <span className="text-muted">{log.count_new} new · {log.count_deduped} deduped</span>
              <span className="text-muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                {new Date(log.run_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
