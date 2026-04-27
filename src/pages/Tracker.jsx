import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LaneBadge from '../components/LaneBadge.jsx';
import FitScoreBadge from '../components/FitScoreBadge.jsx';
import BatchUrlPanel from '../components/BatchUrlPanel.jsx';
import { updateOpportunity } from '../lib/api.js';
import { classifyReadinessGroup, getReadinessReason, READINESS_GROUPS } from '../../netlify/functions/_shared/readiness.js';

const STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'discovered', label: 'Discovered' },
  { id: 'apply_pack_generated', label: 'Pack Ready' },
  { id: 'ready_to_apply', label: 'Ready' },
  { id: 'applied', label: 'Applied' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'stale', label: 'Stale' },
  { id: 'ghosted', label: 'Ghosted' },
];

const SORT_OPTIONS = [
  { id: 'readiness', label: 'Readiness' },
  { id: 'fit_score', label: 'Fit Score' },
  { id: 'recent', label: 'Newest' },
  { id: 'applied', label: 'Applied Date' },
  { id: 'company', label: 'Company' },
];

const READINESS_GROUP_ORDER_SORT = [
  READINESS_GROUPS.READY_TO_APPLY,
  READINESS_GROUPS.APPLIED_FOLLOW_UP,
  READINESS_GROUPS.NEEDS_APPLY_URL,
  READINESS_GROUPS.NEEDS_APPROVAL,
  READINESS_GROUPS.IN_PROGRESS,
  READINESS_GROUPS.LOW_PRIORITY,
];

const READINESS_FILTER_OPTIONS = [
  { id: 'all', label: 'All readiness' },
  { id: READINESS_GROUPS.READY_TO_APPLY, label: 'Ready to Apply' },
  { id: READINESS_GROUPS.APPLIED_FOLLOW_UP, label: 'Follow-up Due' },
  { id: READINESS_GROUPS.NEEDS_APPLY_URL, label: 'Needs URL' },
  { id: READINESS_GROUPS.NEEDS_APPROVAL, label: 'Needs Approval' },
  { id: READINESS_GROUPS.IN_PROGRESS, label: 'In Progress' },
  { id: READINESS_GROUPS.LOW_PRIORITY, label: 'Low Priority' },
];

const READINESS_BADGE_STYLE = {
  [READINESS_GROUPS.READY_TO_APPLY]: { bg: '#dcfce7', color: '#166534', label: 'Ready' },
  [READINESS_GROUPS.NEEDS_APPLY_URL]: { bg: '#dbeafe', color: '#1e40af', label: 'Needs URL' },
  [READINESS_GROUPS.NEEDS_APPROVAL]: { bg: '#fef9c3', color: '#854d0e', label: 'Review' },
  [READINESS_GROUPS.APPLIED_FOLLOW_UP]: { bg: '#ffedd5', color: '#9a3412', label: 'Follow-up' },
  [READINESS_GROUPS.IN_PROGRESS]: { bg: '#f0f9ff', color: '#0369a1', label: 'In Progress' },
  [READINESS_GROUPS.LOW_PRIORITY]: { bg: '#f9fafb', color: '#6b7280', label: 'Low Priority' },
};

function formatDate(value) {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getPostingUrl(opp) {
  return opp.application_url || opp.canonical_job_url || opp.reference_posting_url || opp.url || '';
}

function ReadinessBadge({ opp }) {
  const group = classifyReadinessGroup(opp);
  const style = READINESS_BADGE_STYLE[group] || READINESS_BADGE_STYLE[READINESS_GROUPS.LOW_PRIORITY];
  const reason = getReadinessReason(opp);
  return (
    <div title={reason}>
      <span className="tracker-readiness-badge" style={{ background: style.bg, color: style.color }}>
        {style.label}
      </span>
      {opp.pack_readiness_score != null && (
        <div className="tracker-small-muted">{opp.pack_readiness_score}% ready</div>
      )}
    </div>
  );
}

function StatButton({ label, value, active, onClick }) {
  return (
    <button className={'tracker-stat' + (active ? ' active' : '')} onClick={onClick}>
      <span>{value}</span>
      <strong>{label}</strong>
    </button>
  );
}

export default function Tracker() {
  const { state, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [readinessFilter, setReadinessFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('readiness');
  const [updating, setUpdating] = useState(null);
  const [showBatchUrl, setShowBatchUrl] = useState(false);

  const stats = useMemo(() => {
    const list = state.opportunities;
    return {
      all: list.length,
      discovered: list.filter(o => ['discovered', 'queued'].includes(o.status)).length,
      apply_pack_generated: list.filter(o => ['apply_pack_generated', 'ready_to_apply'].includes(o.status)).length,
      applied: list.filter(o => o.status === 'applied').length,
      review: list.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.NEEDS_APPROVAL).length,
    };
  }, [state.opportunities]);

  const opps = useMemo(() => {
    let list = [...state.opportunities];
    if (filter !== 'all') {
      if (filter === 'apply_pack_generated') {
        list = list.filter(o => ['apply_pack_generated', 'ready_to_apply'].includes(o.status));
      } else {
        list = list.filter(o => o.status === filter);
      }
    }
    if (readinessFilter !== 'all') list = list.filter(o => classifyReadinessGroup(o) === readinessFilter);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(o => [
        o.title,
        o.company,
        o.location,
        o.status,
        o.lane,
        o.source,
        o.description,
        o.recommendation_text,
        ...(o.fit_signals || []),
      ].filter(Boolean).join(' ').toLowerCase().includes(q));
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
    } else if (sortBy === 'recent') {
      list.sort((a, b) => new Date(b.ingested_at || 0) - new Date(a.ingested_at || 0));
    } else if (sortBy === 'applied') {
      list.sort((a, b) => new Date(b.applied_date || 0) - new Date(a.applied_date || 0));
    } else if (sortBy === 'company') {
      list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
    }
    return list;
  }, [state.opportunities, filter, readinessFilter, search, sortBy]);

  const needsUrlCount = useMemo(() =>
    state.opportunities.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.NEEDS_APPLY_URL).length,
  [state.opportunities]);

  const handleStatusChange = async (opp, newStatus) => {
    setUpdating(opp.id);
    try {
      const updates = { status: newStatus, last_action_date: new Date().toISOString() };
      if (newStatus === 'applied' && !opp.applied_date) updates.applied_date = updates.last_action_date;
      await updateOpportunity(opp.id, updates);
      await loadOpportunities();
      notify(`Status updated to ${newStatus}.`, 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div className="tracker-heading">
        <div>
          <h1 className="section-title">Application Control Center</h1>
          <p className="section-sub">Search every job, apply pack, status change, and application result from one place.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => loadOpportunities()}>
          Refresh
        </button>
      </div>

      <div className="tracker-stats">
        <StatButton label="All Jobs" value={stats.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <StatButton label="Discovered" value={stats.discovered} active={filter === 'discovered'} onClick={() => setFilter('discovered')} />
        <StatButton label="Pack Ready" value={stats.apply_pack_generated} active={filter === 'apply_pack_generated'} onClick={() => setFilter('apply_pack_generated')} />
        <StatButton label="Applied" value={stats.applied} active={filter === 'applied'} onClick={() => setFilter('applied')} />
        <StatButton label="Needs Review" value={stats.review} active={readinessFilter === READINESS_GROUPS.NEEDS_APPROVAL} onClick={() => setReadinessFilter(READINESS_GROUPS.NEEDS_APPROVAL)} />
      </div>

      {needsUrlCount > 0 && !showBatchUrl && (
        <div className="tracker-alert">
          <span><strong>{needsUrlCount}</strong> role{needsUrlCount !== 1 ? 's' : ''} need a direct apply URL before the pack can be considered complete.</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchUrl(true)}>Add URLs</button>
        </div>
      )}
      {showBatchUrl && <BatchUrlPanel onClose={() => setShowBatchUrl(false)} />}

      <div className="tracker-toolbar">
        <input
          className="form-input tracker-search"
          placeholder="Search title, company, location, status, source, keywords..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
        <select className="form-input" value={readinessFilter} onChange={e => setReadinessFilter(e.target.value)}>
          {READINESS_FILTER_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
        </select>
      </div>

      <div className="tracker-filters">
        {STATUSES.map(s => (
          <button key={s.id} className={'filter-btn' + (filter === s.id ? ' active' : '')} onClick={() => setFilter(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="tracker-countline">
        Showing <strong>{opps.length}</strong> of <strong>{state.opportunities.length}</strong> jobs
        {search && <span> matching "{search}"</span>}
      </div>

      {opps.length === 0 ? (
        <div className="card card-pad text-muted">No opportunities match the current filter.</div>
      ) : (
        <div className="card tracker-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Fit</th>
                <th>Stage</th>
                <th>Dates</th>
                <th>Source</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {opps.map(o => {
                const postingUrl = getPostingUrl(o);
                return (
                  <tr key={o.id}>
                    <td className="tracker-role-cell">
                      <button className="tracker-title-button" onClick={() => nav(`/opportunity/${o.id}`)}>
                        {o.title || 'Untitled role'}
                      </button>
                      <div className="tracker-company">{o.company || 'Unknown company'}</div>
                      <div className="tracker-meta-line">{o.location || 'Location unknown'}</div>
                      <div className="tracker-chip-row">
                        <LaneBadge lane={o.lane} />
                        {o.high_fit && <span className="tracker-chip tracker-chip-green">High fit</span>}
                        {o.apply_pack && <span className="tracker-chip tracker-chip-blue">Pack created</span>}
                      </div>
                    </td>
                    <td>
                      <FitScoreBadge score={o.fit_score} />
                      {o.pack_readiness_score != null && (
                        <div className="tracker-small-muted">{o.pack_readiness_score}% pack</div>
                      )}
                    </td>
                    <td>
                      <div className="tracker-stage-stack">
                        <StatusBadge status={o.status} />
                        <ReadinessBadge opp={o} />
                      </div>
                    </td>
                    <td className="tracker-date-cell">
                      <div><strong>Found</strong> {formatDate(o.ingested_at)}</div>
                      <div><strong>Updated</strong> {formatDate(o.updated_at || o.last_action_date)}</div>
                      <div><strong>Applied</strong> {formatDate(o.applied_date)}</div>
                    </td>
                    <td>
                      <div className="tracker-source">{o.source || 'unknown'}</div>
                      {postingUrl ? (
                        <a href={postingUrl} target="_blank" rel="noreferrer" className="tracker-link">Open posting</a>
                      ) : (
                        <span className="tracker-small-muted">No posting URL</span>
                      )}
                    </td>
                    <td>
                      <div className="tracker-control-stack">
                        <select
                          className="form-input"
                          value={o.status || 'discovered'}
                          disabled={updating === o.id}
                          onChange={e => handleStatusChange(o, e.target.value)}
                        >
                          {['discovered','queued','approved','needs_apply_url','apply_pack_generated','ready_to_apply','applied','follow_up_1','follow_up_2','interviewing','offer','rejected','stale','ghosted','withdrawn'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <div className="tracker-action-row">
                          <Link className="btn btn-secondary btn-sm" to={`/opportunity/${o.id}`}>Details</Link>
                          <Link className="btn btn-primary btn-sm" to={`/apply-pack/${o.id}`}>Apply Pack</Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
