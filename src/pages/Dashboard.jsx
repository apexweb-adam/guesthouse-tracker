import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import OpportunityCard from '../components/OpportunityCard.jsx';
import QuickAddWidget from '../components/QuickAddWidget.jsx';
import { approveOpportunity } from '../lib/api.js';
import { getBestNextActions, classifyReadinessGroup, READINESS_GROUPS } from '../../netlify/functions/_shared/readiness.js';
import { LANE_CONFIG } from '../../netlify/functions/_shared/scoring.js';
import { isIntermediaryEmployer, EMPLOYER_TYPE } from '../../netlify/functions/_shared/targetEmployers.js';
import { getFollowUpsDue, getAppliedUntouched } from '../../netlify/functions/_shared/outreach.js';

const SOURCE_FAMILY_LABELS = {
  greenhouse: { label: 'Greenhouse', color: '#15803d', bg: '#dcfce7' },
  lever:      { label: 'Lever',      color: '#7c3aed', bg: '#f5f3ff' },
  usajobs:    { label: 'USAJobs',    color: '#1d4ed8', bg: '#eff6ff' },
  seek:       { label: 'SEEK',       color: '#0369a1', bg: '#f0f9ff' },
  apsjobs:    { label: 'APSJobs',    color: '#b45309', bg: '#fef3c7' },
  manual:     { label: 'Manual',     color: '#6b7280', bg: '#f9fafb' },
  csv:        { label: 'CSV',        color: '#6b7280', bg: '#f9fafb' },
};

// ─── Best New Roles Panel ─────────────────────────────────────────────────────
// Shows top pending discovered roles ranked by fit score.
// Source family is shown so the operator can judge source quality at a glance.

function BestNewRolesPanel({ opps, onNavigate }) {
  const now = Date.now();
  const oneDayAgo = new Date(now - 86400000).toISOString();

  const bestNew = useMemo(() =>
    opps
      .filter(o =>
        o.approval_state === 'pending' &&
        !['rejected', 'ghosted', 'stale', 'withdrawn'].includes(o.status) &&
        (o.fit_score || 0) >= 50
      )
      .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
      .slice(0, 6),
  [opps]);

  const newTodayCount = useMemo(() =>
    bestNew.filter(o => (o.discovered_at || o.ingested_at || '') >= oneDayAgo).length,
  [bestNew, oneDayAgo]);

  if (bestNew.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #7c3aed' }}>
      <div className="card-header" style={{ background: '#f5f3ff' }}>
        <h2 style={{ color: '#7c3aed' }}>🏆 Best New Roles — Pending Approval</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('/queue')}>Review all →</button>
      </div>
      {newTodayCount > 0 && (
        <div style={{ padding: '4px 12px 0', fontSize: 12, color: '#15803d', fontWeight: 600 }}>
          {newTodayCount} new today
        </div>
      )}
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bestNew.map(o => {
          const sfMeta = SOURCE_FAMILY_LABELS[o.source_family] || SOURCE_FAMILY_LABELS.manual;
          const laneMeta = LANE_CONFIG[o.lane] || null;
          const isNewToday = (o.discovered_at || o.ingested_at || '') >= oneDayAgo;
          return (
            <div
              key={o.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 0', borderBottom: '1px solid var(--gray-100)',
                cursor: 'pointer',
              }}
              onClick={() => onNavigate(`/opportunity/${o.id}`)}
            >
              {/* Fit score */}
              <span style={{
                fontWeight: 700, fontSize: 15, color: (o.fit_score || 0) >= 85 ? '#15803d' : (o.fit_score || 0) >= 70 ? '#1d4ed8' : '#92400e',
                minWidth: 32, textAlign: 'right',
              }}>
                {o.fit_score || 0}
              </span>
              {/* Title + company */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{o.company}</div>
              </div>
              {/* NEW TODAY badge */}
              {isNewToday && (
                <span style={{
                  background: '#dcfce7', color: '#15803d',
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap', letterSpacing: '0.04em',
                }}>
                  NEW TODAY
                </span>
              )}
              {/* TARGET EMPLOYER badge */}
              {o.is_target_employer && !o.is_intermediary && (
                <span style={{
                  background: '#eff6ff', color: '#1d4ed8',
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap', letterSpacing: '0.04em', border: '1px solid #bfdbfe',
                }}>
                  🎯 TARGET
                </span>
              )}
              {/* INTERMEDIARY warning badge */}
              {o.is_intermediary && (
                <span style={{
                  background: '#fef3c7', color: '#92400e',
                  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap', letterSpacing: '0.04em',
                }}>
                  ⚙ Staffing
                </span>
              )}
              {/* Lane badge */}
              {laneMeta && (
                <span style={{
                  background: `${laneMeta.color}18`, color: laneMeta.color,
                  padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {laneMeta.short}
                </span>
              )}
              {/* Source family badge */}
              <span style={{
                background: sfMeta.bg, color: sfMeta.color,
                padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {sfMeta.label}
              </span>
            </div>
          );
        })}
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
          Showing pending roles with fit score ≥ 50, ranked by score. Approve strong TPM/Delivery roles first.
        </div>
      </div>
    </div>
  );
}

// ─── Outreach Cadence Panel ───────────────────────────────────────────────────
// Shows: follow-ups due today, applied but no outreach sent, outreach overdue.
// Does NOT auto-send anything. All actions are manual.

function OutreachCadencePanel({ opps, onNavigate }) {
  const followUpsDue = useMemo(() => getFollowUpsDue(opps), [opps]);
  const appliedUntouched = useMemo(() => getAppliedUntouched(opps), [opps]);

  if (followUpsDue.length === 0 && appliedUntouched.length === 0) return null;

  const overdue = followUpsDue.filter(o => o.next_action_due && new Date(o.next_action_due) < new Date());

  return (
    <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid #0369a1' }}>
      <div className="card-header" style={{ background: '#f0f9ff' }}>
        <h2 style={{ color: '#0369a1' }}>📬 Outreach & Follow-Up Cadence</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('/tracker')}>View tracker →</button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Follow-ups due / overdue */}
        {followUpsDue.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: overdue.length > 0 ? '#c2410c' : '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              {overdue.length > 0 ? `🔴 ${overdue.length} follow-up${overdue.length > 1 ? 's' : ''} overdue` : `📅 ${followUpsDue.length} follow-up${followUpsDue.length > 1 ? 's' : ''} due`}
            </div>
            {followUpsDue.slice(0, 3).map(o => (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0', borderBottom: '1px solid var(--gray-100)',
                cursor: 'pointer',
              }} onClick={() => onNavigate(`/opportunity/${o.id}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{o.company}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                  background: o.next_action_due && new Date(o.next_action_due) < new Date() ? '#fee2e2' : '#fff7ed',
                  color: o.next_action_due && new Date(o.next_action_due) < new Date() ? '#c2410c' : '#92400e',
                  whiteSpace: 'nowrap',
                }}>
                  {o.next_action_due ? (new Date(o.next_action_due) < new Date() ? '⚠ Overdue' : `Due ${o.next_action_due}`) : '📬 Follow-up due'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Applied but no outreach sent */}
        {appliedUntouched.length > 0 && (
          <div style={{ marginTop: followUpsDue.length > 0 ? 8 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              ○ {appliedUntouched.length} applied role{appliedUntouched.length > 1 ? 's' : ''} — no outreach sent yet
            </div>
            {appliedUntouched.slice(0, 2).map(o => (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0', borderBottom: '1px solid var(--gray-100)',
                cursor: 'pointer',
              }} onClick={() => onNavigate(`/opportunity/${o.id}`)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{o.company}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>Open pack to draft outreach →</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, fontStyle: 'italic' }}>
          Outreach must be sent manually. Open the Apply Pack → Outreach tab for drafts.
        </div>
      </div>
    </div>
  );
}

// ─── Follow-up Due Alert Banner ───────────────────────────────────────────────
// Shows only when real follow-up actions are overdue or due today/tomorrow.
// Dismissable for the session. Does not create fake urgency.

function FollowUpBanner({ opps, onNavigate }) {
  const [dismissed, setDismissed] = useState(false);

  const overdue = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const tomorrowEnd = new Date(now);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    return opps.filter(o => {
      if (!o.next_action_due) return false;
      if (['rejected','ghosted','withdrawn'].includes(o.status)) return false;
      const due = new Date(o.next_action_due);
      return due <= tomorrowEnd; // Due today, tomorrow, or already overdue
    }).sort((a, b) => new Date(a.next_action_due) - new Date(b.next_action_due));
  }, [opps]);

  if (dismissed || overdue.length === 0) return null;

  const isOverdue = overdue.filter(o => new Date(o.next_action_due) < new Date());
  const urgencyColor = isOverdue.length > 0 ? '#c2410c' : '#92400e';
  const urgencyBg = isOverdue.length > 0 ? '#fff1f2' : '#fef3c7';
  const urgencyBorder = isOverdue.length > 0 ? '#fca5a5' : '#fde68a';
  const icon = isOverdue.length > 0 ? '🔴' : '📅';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: urgencyBg, border: `1px solid ${urgencyBorder}`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 16,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, color: urgencyColor, fontSize: 13 }}>
          {isOverdue.length > 0
            ? `${isOverdue.length} follow-up${isOverdue.length > 1 ? 's' : ''} overdue`
            : `${overdue.length} follow-up${overdue.length > 1 ? 's' : ''} due soon`}
        </span>
        <span style={{ color: urgencyColor, fontSize: 12, marginLeft: 8 }}>
          {overdue[0].title} @ {overdue[0].company}
          {overdue.length > 1 ? ` + ${overdue.length - 1} more` : ''}
        </span>
      </div>
      <button
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: urgencyColor, fontSize: 13, fontWeight: 600 }}
        onClick={() => onNavigate('/tracker')}
      >
        View →
      </button>
      <button
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1 }}
        onClick={() => setDismissed(true)}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const { opportunities: opps, logs, sources, demoMode } = state;

  const stats = useMemo(() => ({
    queue: opps.filter(o => o.approval_state === 'pending' && !['rejected','ghosted','stale'].includes(o.status)).length,
    discovered: opps.filter(o => o.status === 'discovered').length,
    active: opps.filter(o => ['approved','applied','interviewing','offer'].includes(o.status)).length,
    stale: opps.filter(o => o.stale_flag || o.isStale || o.isGhosted).length,
    readyToApply: opps.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.READY_TO_APPLY).length,
  }), [opps]);

  const bestActions = useMemo(() => getBestNextActions(opps), [opps]);

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

      {/* Follow-up Due Alert — only when real overdue/upcoming tasks exist */}
      <FollowUpBanner opps={opps} onNavigate={nav} />

      {/* Outreach Cadence Panel — follow-ups due, applied but untouched */}
      <OutreachCadencePanel opps={opps} onNavigate={nav} />

      {/* Quick Add Widget */}
      <QuickAddWidget />

      {/* Best New Roles — top pending roles by fit score with source family */}
      <BestNewRolesPanel opps={opps} onNavigate={nav} />

      {/* Stats Row */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          { value: stats.readyToApply, label: 'Ready to Apply', sub: 'Pack 70%+ + apply URL', action: () => nav('/tracker'), color: 'var(--green)' },
          { value: stats.queue, label: 'Pending Approval', sub: 'Need review', action: () => nav('/queue'), color: 'var(--amber)' },
          { value: stats.active, label: 'In Progress', sub: 'Approved / applied / interviewing', color: 'var(--blue)' },
          { value: stats.stale, label: 'Stale / Ghosted', sub: 'Need follow-up or close', color: stats.stale > 0 ? 'var(--red)' : undefined },
        ].map((s, i) => (
          <div key={i} className="card stat-card" style={{ cursor: s.action ? 'pointer' : 'default' }} onClick={s.action}>
            <div className="stat-card__value" style={s.color ? { color: s.color } : {}}>{s.value}</div>
            <div className="stat-card__label">{s.label}</div>
            <div className="stat-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Action Center */}
      {bestActions.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--navy)' }}>
          <div className="card-header">
            <h2>🎯 Action Center — What to do right now</h2>
            <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>{new Date().toLocaleDateString()}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bestActions.map((action, i) => {
              const iconMap = {
                ready_to_apply: '✅',
                follow_up_due: '⏰',
                needs_apply_url: '🔗',
                needs_approval: '⭐',
                stale_review: '🧹',
              };
              const colorMap = {
                ready_to_apply: 'var(--green)',
                follow_up_due: 'var(--amber)',
                needs_apply_url: 'var(--blue)',
                needs_approval: 'var(--amber)',
                stale_review: 'var(--gray-500)',
              };
              const navMap = {
                ready_to_apply: '/tracker',
                follow_up_due: '/tracker',
                needs_apply_url: '/tracker',
                needs_approval: '/queue',
                stale_review: '/tracker',
              };
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                  background: 'var(--gray-50)', borderRadius: 8, cursor: 'pointer',
                  borderLeft: `3px solid ${colorMap[action.type] || 'var(--gray-300)'}`,
                }} onClick={() => action.topOpp ? nav(`/opportunity/${action.topOpp.id}`) : nav(navMap[action.type] || '/')}>
                  <span style={{ fontSize: 18 }}>{iconMap[action.type] || '•'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{action.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 2 }}>{action.detail}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>→</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
