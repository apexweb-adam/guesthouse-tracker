import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import OpportunityCard from '../components/OpportunityCard.jsx';
import { approveOpportunity } from '../lib/api.js';

export default function ApprovalQueue() {
  const { state, loadOpportunities, notify } = useApp();
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);

  const pending = useMemo(() =>
    state.opportunities
      .filter(o => o.approval_state === 'pending' && !['rejected','ghosted','stale'].includes(o.status))
      .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)),
  [state.opportunities]);

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

  return (
    <div>
      <h1 className="section-title">Approval Queue</h1>
      <p className="section-sub">
        All role approvals are human-controlled. Review each opportunity before it can be applied to.
      </p>

      {pending.length === 0 ? (
        <div className="card approval-empty">
          <div className="approval-empty__icon">✅</div>
          <div className="approval-empty__title">Queue is clear</div>
          <div className="text-muted text-sm">New opportunities discovered by intake will appear here for review.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(opp => (
            <div key={opp.id} className="card card-pad">
              <OpportunityCard opp={opp} />
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
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: '14px 20px', background: 'var(--amber-light)', border: '1px solid #fcd34d' }}>
        <strong>Approval gate enforced.</strong> Opportunities cannot be applied to until explicitly approved here.
        No LinkedIn automation. No browser-bot flows. All outreach and submission are human-initiated.
      </div>
    </div>
  );
}
