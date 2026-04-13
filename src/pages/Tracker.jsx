import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LaneBadge from '../components/LaneBadge.jsx';
import FitScoreBadge from '../components/FitScoreBadge.jsx';
import { updateOpportunity } from '../lib/api.js';

const STATUSES = ['all', 'discovered', 'queued', 'approved', 'applied', 'interviewing', 'offer', 'rejected', 'stale', 'ghosted'];

export default function Tracker() {
  const { state, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);

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
    return list.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
  }, [state.opportunities, filter, search]);

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
      <p className="section-sub">Full pipeline view — all opportunities and their current status.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="Search title or company..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
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
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      className="form-input"
                      value={o.status}
                      disabled={updating === o.id}
                      onChange={e => handleStatusChange(o, e.target.value)}
                      style={{ padding: '3px 6px', fontSize: 12 }}
                    >
                      {['discovered','queued','approved','applied','interviewing','offer','rejected','stale','ghosted'].map(s => (
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
