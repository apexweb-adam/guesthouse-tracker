import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LaneBadge from '../components/LaneBadge.jsx';
import FitScoreBadge from '../components/FitScoreBadge.jsx';
import BatchUrlPanel from '../components/BatchUrlPanel.jsx';
import { updateOpportunity } from '../lib/api.js';
import { classifyReadinessGroup, getReadinessReason, READINESS_GROUPS, READINESS_GROUP_LABELS } from '../../netlify/functions/_shared/readiness.js';

const STATUSES = ['all', 'discovered', 'queued', 'approved', 'applied', 'interviewing', 'offer', 'rejected', 'stale', 'ghosted'];
const SORT_OPTIONS = ['readiness', 'fit_score', 'status'];

const READINESS_BADGE_STYLE = {
  [READINESS_GROUPS.READY_TO_APPLY]: { bg: '#dcfce7', color: '#166534', label: '✅ Ready' },
  [READINESS_GROUPS.NEEDS_APPLY_URL]: { bg: '#dbeafe', color: '#1e40af', label: '🔗 Needs URL' },
  [READINESS_GROUPS.NEEDS_APPROVAL]: { bg: '#fef9c3', color: '#854d0e', label: '⭐ Needs Approval' },
  [READINESS_GROUPS.APPLIED_FOLLOW_UP]: { bg: '#ffedd5', color: '#9a3412', label: '⏰ Follow-up Due' },
  [READINESS_GROUPS.IN_PROGRESS]: { bg: '#f0f9ff', color: '#0369a1', label: '⚙ In Progress' },
  [READINESS_GROUPS.LOW_PRIORITY]: { bg: '#f9fafb', color: '#6b7280', label: '— Low Priority' },
};

function ReadinessBadge({ opp }) {
  const group = classifyReadinessGroup(opp);
  const style = READINESS_BADGE_STYLE[group] || READINESS_BADGE_STYLE[READINESS_GROUPS.LOW_PRIORITY];
  const reason = getReadinessReason(opp);
  return (
    <div title={reason}>
      <span style={{
        display: 'inline-block', padding: '2px 7px', borderRadius: 9999,
        fontSize: 11, fontWeight: 600, background: style.bg, color: style.color,
        whiteSpace: 'nowrap',
      }}>{style.label}</span>
      {opp.pack_readiness_score != null && (
        <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 1 }}>{opp.pack_readiness_score}% ready</div>
      )}
    </div>
  );
}

export default function Tracker() {
  const { state, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('readiness');
  const [updating, setUpdating] = useState(null);
  const [showBatchUrl, setShowBatchUrl] = useState(false);

  const READINESS_GROUP_ORDER_SORT = [
    READINESS_GROUPS.READY_TO_APPLY,
    READINESS_GROUPS.APPLIED_FOLLOW_UP,
    READINESS_GROUPS.NEEDS_APPLY_URL,
    READINESS_GROUPS.NEEDS_APPROVAL,
    READINESS_GROUPS.IN_PROGRESS,
    READINESS_GROUPS.LOW_PRIORITY,
  ];

  const opps = useMemo(() => {
    let list = [...state.opportunities];
    if (filter !== 'all') list = list.filter(o => o.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.title || '').toLowerCase().includes(q) ||
        (o.company || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'readiness') {
      list.sort((a, b) => {
        const ga = READINESS_GROUP_ORDER_SORT.indexOf(classifyReadinessGroup(a));
        const gb = READINESS_GROUP_ORDER_SORT.indexOf(classifyReadinessGroup(b));
        if (ga !== gb) return ga - gb;
        return (b.pack_readiness_score || 0) - (a.pack_readiness_score || 0) ||
          (b.fit_score || 0) - (a.fit_score || 0);
      });
    } else if (sortBy === 'fit_score') {
      list.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
    } else {
      list.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
    }
    return list;
  }, [state.opportunities, filter, search, sortBy]);

  const needsUrlCount = useMemo(() =>
    state.opportunities.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.NEEDS_APPLY_URL).length,
  [state.opportunities]);

  const handleStatusChange = async (opp, newStatus) => {
    setUpdating(opp.id);
    try {
      await updateOpportunity(opp.id, { status: newStatus, last_action_date: new Date().toISOString() });
      await loadOpportunities();
      notify(`Status updated to ${newStatus}.`, 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setUpdating(null); }
  };

  return (
    <div>
      <h1 className="section-title">Tracker</h1>
      <p className="section-sub">Full pipeline view — sorted by readiness by default.</p>

      {/* Batch URL Panel — shown when there are blocked roles needing apply URL */}
      {needsUrlCount > 0 && !showBatchUrl && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          background: '#fff7ed', border: '1px solid #fde68a', borderRadius: 8,
          padding: '10px 14px',
        }}>
          <span style={{ fontSize: 16 }}>🔗</span>
          <span style={{ fontSize: 13, color: '#c2410c', flex: 1 }}>
            <strong>{needsUrlCount}</strong> approved role{needsUrlCount !== 1 ? 's' : ''} blocked — missing apply URL
          </span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: '#c2410c', borderColor: '#fca5a5' }}
            onClick={() => setShowBatchUrl(true)}
          >
            + Add URLs
          </button>
        </div>
      )}
      {showBatchUrl && <BatchUrlPanel onClose={() => setShowBatchUrl(false)} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          placeholder="Search title or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600 }}>Sort:</span>
          {SORT_OPTIONS.map(s => (
            <button key={s} className={'filter-btn' + (sortBy === s ? ' active' : '')} onClick={() => setSortBy(s)}>
              {s === 'readiness' ? '🎯 Readiness' : s === 'fit_score' ? '⭐ Fit Score' : '📋 Status'}
            </button>
          ))}
        </div>
        <div className="tracker-filters">
          {STATUSES.map(s => (
            <button key={s} className={'filter-btn' + (filter === s ? ' active' : '')} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {opps.length === 0 ? (
        <div className="card card-pad text-muted">No opportunities match the current filter.</div>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--gray-200)', background: 'var(--gray-50)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Readiness</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Score</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Role</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Lane</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Update Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Next Action</th>
              </tr>
            </thead>
            <tbody>
              {opps.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '10px 12px' }}><ReadinessBadge opp={o} /></td>
                  <td style={{ padding: '10px 12px' }}><FitScoreBadge score={o.fit_score} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <div className="font-medium" style={{ cursor: 'pointer', color: 'var(--navy)' }} onClick={() => nav(`/opportunity/${o.id}`)}>
                      {o.title}
                    </div>
                    <div className="text-muted text-sm">{o.company}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}><LaneBadge lane={o.lane} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <StatusBadge status={o.status} />
                    {o.stale_flag && <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>⏳ stale</div>}
                    {o.approval_state === 'approved' && (
                      <Link to={`/apply-pack/${o.id}`} style={{ display: 'block', fontSize: 10, color: 'var(--blue)', marginTop: 3 }}>
                        📦 {o.apply_pack ? 'Apply Pack' : 'Generate Pack'}
                      </Link>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      className="form-input"
                      value={o.status}
                      disabled={updating === o.id}
                      onChange={e => handleStatusChange(o, e.target.value)}
                      style={{ padding: '3px 6px', fontSize: 12 }}
                    >
                      {['discovered','queued','approved','needs_apply_url','apply_pack_generated','ready_to_apply','applied','follow_up_1','follow_up_2','interviewing','offer','rejected','stale','ghosted','withdrawn'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: o.next_action_due ? 'var(--amber)' : 'var(--gray-400)' }}>
                    {o.next_action || '—'}
                    {o.next_action_due && <div style={{ fontSize: 11 }}>{o.next_action_due}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
