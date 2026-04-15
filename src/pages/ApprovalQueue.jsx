import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import OpportunityCard from '../components/OpportunityCard.jsx';
import { approveOpportunity } from '../lib/api.js';
import { classifyReadinessGroup, getReadinessReason, READINESS_GROUPS } from '../../netlify/functions/_shared/readiness.js';

// ─── Readiness indicator chip shown per pending opportunity ───────────────────

function ReadinessBadge({ opp }) {
  const group = classifyReadinessGroup(opp);
  const reason = getReadinessReason(opp);
  const score = opp.pack_readiness_score;

  const styles = {
    [READINESS_GROUPS.NEEDS_APPROVAL]: { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8', icon: '📋' },
    [READINESS_GROUPS.NEEDS_APPLY_URL]: { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', icon: '🔗' },
    [READINESS_GROUPS.LOW_PRIORITY]: { bg: '#f9fafb', border: '#d1d5db', color: '#6b7280', icon: '⬇' },
  };
  const s = styles[group] || styles[READINESS_GROUPS.NEEDS_APPROVAL];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6,
      padding: '6px 10px', marginTop: 10, fontSize: 12,
    }}>
      <span>{s.icon}</span>
      <span style={{ color: s.color, fontWeight: 600 }}>{reason}</span>
      {typeof score === 'number' && (
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontWeight: 500 }}>
          Readiness: {score}%
        </span>
      )}
    </div>
  );
}

// ─── Priority label for fit score ─────────────────────────────────────────────

function FitPriorityChip({ opp }) {
  const score = opp.fit_score || 0;
  const isHighFit = score >= 70;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: isHighFit ? '#dcfce7' : '#f3f4f6',
      color: isHighFit ? '#15803d' : '#6b7280',
      marginLeft: 8,
    }}>
      {isHighFit ? '⭐ High Fit' : `Fit: ${score}`}
    </span>
  );
}

export default function ApprovalQueue() {
  const { state, loadOpportunities, notify } = useApp();
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);
  const [sortBy, setSortBy] = useState('fit'); // 'fit' | 'readiness'

  // Split pending by fit tier for grouped display
  const { highFit, standard, weakFit } = useMemo(() => {
    const all = state.opportunities
      .filter(o => o.approval_state === 'pending' && !['rejected','ghosted','stale'].includes(o.status));

    const sorted = [...all].sort((a, b) => {
      if (sortBy === 'readiness') {
        // Sort by pack_readiness_score desc, then fit_score desc
        const ra = a.pack_readiness_score || 0;
        const rb = b.pack_readiness_score || 0;
        if (rb !== ra) return rb - ra;
      }
      return (b.fit_score || 0) - (a.fit_score || 0);
    });

    return {
      highFit: sorted.filter(o => (o.fit_score || 0) >= 70 && o.recommended),
      standard: sorted.filter(o => (o.fit_score || 0) >= 50 && ((o.fit_score || 0) < 70 || !o.recommended)),
      weakFit: sorted.filter(o => (o.fit_score || 0) < 50),
    };
  }, [state.opportunities, sortBy]);

  const total = highFit.length + standard.length + weakFit.length;

  const handle = async (opp, action) => {
    setProcessing(opp.id);
    try {
      await approveOpportunity(opp.id, action, reason);
      await loadOpportunities();
      notify(`Opportunity ${action}d.`, action === 'approve' ? 'success' : 'info');
      setReason('');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const renderOpp = (opp) => (
    <div key={opp.id} className="card card-pad" style={{ borderLeft: (opp.fit_score || 0) >= 70 && opp.recommended ? '4px solid var(--green)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <OpportunityCard opp={opp} />
        </div>
        <FitPriorityChip opp={opp} />
      </div>
      <ReadinessBadge opp={opp} />
      {/* Missing apply URL warning */}
      {!opp.application_url && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#c2410c', background: '#fff7ed', borderRadius: 4, padding: '4px 8px' }}>
          ⚠ No apply URL set — add one after approving to unlock full readiness
        </div>
      )}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Optional reason / note"
          value={processing === opp.id ? reason : ''}
          onChange={e => setReason(e.target.value)}
        />
        <button
          className="btn btn-success"
          disabled={processing === opp.id}
          onClick={() => handle(opp, 'approve')}
        >
          ✓ Approve
        </button>
        <button
          className="btn btn-danger"
          disabled={processing === opp.id}
          onClick={() => handle(opp, 'reject')}
        >
          ✕ Reject
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div>
          <h1 className="section-title">Approval Queue</h1>
          <p className="section-sub">
            All role approvals are human-controlled. Review each opportunity before it can be applied to.
          </p>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Sort by:</span>
            <button
              className={`btn btn-sm ${sortBy === 'fit' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSortBy('fit')}
            >Fit Score</button>
            <button
              className={`btn btn-sm ${sortBy === 'readiness' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSortBy('readiness')}
            >Readiness</button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="card approval-empty">
          <div className="approval-empty__icon">✅</div>
          <div className="approval-empty__title">Queue is clear</div>
          <div className="text-muted text-sm">New opportunities discovered by intake will appear here for review.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* High Fit Group */}
          {highFit.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>⭐ High-Fit — Approve First</span>
                <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{highFit.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {highFit.map(renderOpp)}
              </div>
            </div>
          )}

          {/* Standard Group */}
          {standard.length > 0 && (
            <div style={{ marginTop: highFit.length > 0 ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>📋 Standard — Review</span>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{standard.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {standard.map(renderOpp)}
              </div>
            </div>
          )}

          {/* Weak Fit Group */}
          {weakFit.length > 0 && (
            <div style={{ marginTop: (highFit.length + standard.length) > 0 ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>⬇ Weak Fit — Low Priority</span>
                <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{weakFit.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {weakFit.map(renderOpp)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: '14px 20px', background: 'var(--amber-light)', border: '1px solid #fcd34d' }}>
        <strong>Approval gate enforced.</strong> Opportunities cannot be applied to until explicitly approved here.
        No LinkedIn automation. No browser-bot flows. All outreach and submission are human-initiated.
      </div>
    </div>
  );
}

