import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { approveOpportunity, triggerDiscover } from '../lib/api.js';

const LANE_LABELS = {
  tpm: 'TPM',
  delivery: 'Delivery',
  ops_conditional: 'Ops (Cond.)',
  program_manager: 'Prog. Mgr',
  other: 'Other',
};

const TRUST_COLORS = {
  high: '#166534',
  medium: '#92400e',
  low: '#991b1b',
};

const SOURCE_ICONS = {
  greenhouse: '🌱',
  lever: '⚙️',
  usajobs: '🇺🇸',
  seek: '🔍',
  rss: '📡',
  demo: '🧪',
  manual: '✏️',
  csv: '📄',
};

function FitBadge({ score }) {
  const color = score >= 75 ? '#166534' : score >= 55 ? '#92400e' : '#6b7280';
  const bg = score >= 75 ? '#dcfce7' : score >= 55 ? '#fef3c7' : '#f3f4f6';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 700,
      color,
      background: bg,
    }}>
      {score ?? '–'}
    </span>
  );
}

function DiscoveredCard({ opp, onApprove, onReject, processing }) {
  const navigate = useNavigate();
  const isDemo = opp.is_demo_record;
  const laneLabel = LANE_LABELS[opp.lane] || opp.lane || '–';
  const srcIcon = SOURCE_ICONS[opp.source_family] || '📋';
  const openUrl = opp.canonical_job_url || opp.application_url;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '16px 20px',
      marginBottom: 12,
      position: 'relative',
    }}>
      {/* Demo badge */}
      {isDemo && (
        <span style={{
          position: 'absolute', top: 12, right: 12,
          background: '#f3f4f6', color: '#6b7280',
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 9999,
        }}>DEMO</span>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 2 }}>
            {opp.title}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {opp.company}
            {opp.location ? ` · ${opp.location}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <FitBadge score={opp.fit_score} />
          {opp.recommended && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 9999 }}>
              ★ Recommended
            </span>
          )}
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: '#1e3a5f', background: '#eff6ff',
            padding: '2px 8px', borderRadius: 9999,
          }}>
            {laneLabel}
          </span>
        </div>
      </div>

      {/* Source / metadata row */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
        <span>{srcIcon} {opp.source_family || 'unknown'}</span>
        {opp.source_job_id && <span>ID: {opp.source_job_id}</span>}
        {opp.discovered_at && (
          <span>Discovered: {new Date(opp.discovered_at).toLocaleDateString()}</span>
        )}
        {opp.trust_level && (
          <span style={{ color: TRUST_COLORS[opp.trust_level] || '#6b7280', fontWeight: 600 }}>
            Trust: {opp.trust_level}
          </span>
        )}
        {openUrl && !isDemo && (
          <span style={{ color: '#2563eb' }}>✓ Real URL</span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => onApprove(opp.id)}
          disabled={processing === opp.id}
          style={{
            padding: '6px 14px', background: '#166534', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ✓ Approve
        </button>
        <button
          onClick={() => onReject(opp.id)}
          disabled={processing === opp.id}
          style={{
            padding: '6px 14px', background: '#fff', color: '#991b1b',
            border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, cursor: 'pointer',
          }}
        >
          ✗ Reject
        </button>
        <button
          onClick={() => navigate(`/opportunity/${opp.id}`)}
          style={{
            padding: '6px 14px', background: '#fff', color: '#1e3a5f',
            border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, cursor: 'pointer',
          }}
        >
          Details →
        </button>
        {openUrl && !isDemo && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px', background: '#fff', color: '#0369a1',
              border: '1px solid #bae6fd', borderRadius: 6, fontSize: 13,
              textDecoration: 'none', fontWeight: 600,
            }}
          >
            📄 Open Posting ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function Discovered() {
  const { state, loadOpportunities, notify } = useApp();
  const [processing, setProcessing] = useState(null);
  const [discoverRunning, setDiscoverRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const [filterRec, setFilterRec] = useState(false);
  const [filterDemo, setFilterDemo] = useState('all'); // 'all' | 'live' | 'demo'
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'date'

  // Show only newly-discovered / pending-approval records
  const discovered = useMemo(() => {
    let list = state.opportunities.filter(o =>
      ['discovered', 'queued', 'pending'].includes(o.status) ||
      o.approval_state === 'pending'
    );
    if (filterRec) list = list.filter(o => o.recommended);
    if (filterDemo === 'live') list = list.filter(o => !o.is_demo_record);
    if (filterDemo === 'demo') list = list.filter(o => o.is_demo_record);
    if (sortBy === 'score') list = [...list].sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
    if (sortBy === 'date') {
      list = [...list].sort((a, b) =>
        new Date(b.discovered_at || b.ingested_at || 0) - new Date(a.discovered_at || a.ingested_at || 0)
      );
    }
    return list;
  }, [state.opportunities, filterRec, filterDemo, sortBy]);

  const strongFit = discovered.filter(o => (o.fit_score || 0) >= 75 && o.recommended).length;

  const handleApprove = async (id) => {
    setProcessing(id);
    try {
      await approveOpportunity(id, 'approve');
      await loadOpportunities();
      notify('Approved — Apply Pack generated automatically.', 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id) => {
    setProcessing(id);
    try {
      await approveOpportunity(id, 'reject');
      await loadOpportunities();
      notify('Rejected.', 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleRunDiscover = async () => {
    setDiscoverRunning(true);
    setLastRunResult(null);
    try {
      // In demo mode this is a safe no-op.
      // In live mode the caller needs DISCOVERY_SECRET in env and configured sources.
      const result = await triggerDiscover({});
      setLastRunResult(result);
      if (result.total_ingested > 0) {
        await loadOpportunities();
        notify(`Discovery complete — ${result.total_ingested} new job(s) queued.`, 'success');
      } else if (result.mode === 'demo') {
        notify('Demo mode: discovery skipped. Set LIVE_INTAKE_ENABLED=true for real discovery.', 'info');
      } else {
        notify('Discovery run complete — no new jobs found.', 'info');
      }
    } catch (e) {
      notify(`Discovery failed: ${e.message}`, 'error');
    } finally {
      setDiscoverRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f', margin: 0 }}>
            🔍 Discovered Jobs
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Newly discovered roles awaiting your review and approval.
            {strongFit > 0 && (
              <span style={{ color: '#166534', fontWeight: 700 }}>
                {' '}· {strongFit} strong-fit role{strongFit > 1 ? 's' : ''} ready to review.
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleRunDiscover}
            disabled={discoverRunning}
            style={{
              padding: '8px 16px',
              background: discoverRunning ? '#93c5fd' : '#1e3a5f',
              color: '#fff', border: 'none', borderRadius: 7,
              fontWeight: 700, fontSize: 13, cursor: discoverRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {discoverRunning ? '⏳ Discovering…' : '▶ Run Discovery'}
          </button>
          <Link
            to="/discover/profile"
            style={{
              padding: '8px 14px', background: '#fff', color: '#1e3a5f',
              border: '1px solid #bfdbfe', borderRadius: 7, fontWeight: 600,
              fontSize: 13, textDecoration: 'none',
            }}
          >
            ⚙ Profile
          </Link>
        </div>
      </div>

      {/* Last run result */}
      {lastRunResult && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13,
        }}>
          <strong>Last run:</strong>{' '}
          {lastRunResult.mode === 'demo'
            ? 'Demo mode — no real discovery ran.'
            : `${lastRunResult.sources_run ?? 0} source(s) · ${lastRunResult.total_discovered ?? 0} found · ${lastRunResult.total_ingested ?? 0} new`
          }
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={filterRec}
            onChange={e => setFilterRec(e.target.checked)}
          />
          Recommended only
        </label>

        <select
          value={filterDemo}
          onChange={e => setFilterDemo(e.target.value)}
          style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value="all">All records</option>
          <option value="live">Live only</option>
          <option value="demo">Demo only</option>
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
        >
          <option value="score">Sort by fit score</option>
          <option value="date">Sort by discovery date</option>
        </select>

        <span style={{ fontSize: 13, color: '#6b7280', marginLeft: 'auto' }}>
          {discovered.length} role{discovered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state */}
      {discovered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 0', color: '#9ca3af',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No discovered jobs in queue</div>
          <div style={{ fontSize: 13 }}>
            Click <strong>Run Discovery</strong> to fetch real jobs from configured sources.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/sources" style={{ fontSize: 13, color: '#2563eb' }}>Configure sources →</Link>
            {' · '}
            <Link to="/discover/profile" style={{ fontSize: 13, color: '#2563eb' }}>Edit discovery profile →</Link>
          </div>
        </div>
      )}

      {/* Cards */}
      {discovered.map(opp => (
        <DiscoveredCard
          key={opp.id}
          opp={opp}
          onApprove={handleApprove}
          onReject={handleReject}
          processing={processing}
        />
      ))}
    </div>
  );
}
