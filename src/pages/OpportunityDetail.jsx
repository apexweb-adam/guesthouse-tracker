import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import FitScoreBadge from '../components/FitScoreBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LaneBadge from '../components/LaneBadge.jsx';
import { approveOpportunity, updateOpportunity, fetchPrep, updateApplyUrl } from '../lib/api.js';
import { getResumeEmphasisLabel } from '../../netlify/functions/_shared/scoring.js';

export default function OpportunityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, loadOpportunities, notify } = useApp();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [prep, setPrep] = useState(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [applyUrlInput, setApplyUrlInput] = useState('');
  const [savingApplyUrl, setSavingApplyUrl] = useState(false);

  const opp = state.opportunities.find(o => o.id === id);

  useEffect(() => {
    if (opp) setNotes(opp.notes || '');
  }, [opp?.id]);

  const loadPrep = useCallback(async () => {
    if (!opp || prepLoading) return;
    setPrepLoading(true);
    try {
      const data = await fetchPrep(opp.id);
      setPrep(data?.prep || null);
      setPrepOpen(true);
    } catch (e) {
      notify(`Could not load prep package: ${e.message}`, 'error');
    } finally {
      setPrepLoading(false);
    }
  }, [opp, prepLoading, notify]);

  if (!opp) return (
    <div className="card card-pad">
      <div className="text-muted">Opportunity not found.</div>
      <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => nav(-1)}>← Back</button>
    </div>
  );

  const handleApprove = async (action) => {
    setSaving(true);
    try {
      await approveOpportunity(opp.id, action, reason);
      await loadOpportunities();
      notify(`${action === 'approve' ? 'Approved' : 'Rejected'} successfully.`, action === 'approve' ? 'success' : 'info');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      await updateOpportunity(opp.id, { notes });
      await loadOpportunities();
      notify('Notes saved.', 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{children}</div>
    </div>
  );

  return (
    <div>
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => nav(-1)}>← Back</button>
        {opp.approval_state === 'approved' && (
          <Link to={`/apply-pack/${id}`} className="btn btn-primary btn-sm">
            📦 {opp.apply_pack ? 'View Apply Pack' : 'Generate Apply Pack'}
          </Link>
        )}
      </div>

      <div className="detail-grid">
        {/* Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <FitScoreBadge score={opp.fit_score} />
              <LaneBadge lane={opp.lane} />
              <StatusBadge status={opp.status} />
              {opp.approval_state === 'approved' && <span className="badge" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>✓ Approved</span>}
              {opp.is_demo_record && (
                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: 11 }}>
                  DEMO
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>{opp.title}</h1>
            <div style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 12 }}>
              {opp.company}{opp.location ? ` · ${opp.location}` : ''}
            </div>
            {/* URL buttons — real canonical link + separate apply URL if distinct */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {(opp.canonical_job_url || opp.url) && !opp.is_demo_record && (
                <a
                  href={opp.canonical_job_url || opp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  📄 Open Original Posting ↗
                </a>
              )}
              {opp.application_url && opp.application_url !== (opp.canonical_job_url || opp.url) && !opp.is_demo_record && (
                <a
                  href={opp.application_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--green)' }}
                >
                  ✅ Open Apply URL ↗
                </a>
              )}
              {/* Missing apply URL inline update */}
              {(opp.is_manual_external_intake || opp.source_family === 'manual_external') &&
               !opp.application_url && !opp.is_demo_record && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!applyUrlInput.trim()) return;
                    setSavingApplyUrl(true);
                    try {
                      await updateApplyUrl(opp.id, applyUrlInput.trim());
                      await loadOpportunities();
                      setApplyUrlInput('');
                      notify('Apply URL saved.', 'success');
                    } catch (err) {
                      notify(err.message, 'error');
                    } finally {
                      setSavingApplyUrl(false);
                    }
                  }}
                  style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>⚠ No apply URL</span>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="Paste apply URL…"
                    value={applyUrlInput}
                    onChange={e => setApplyUrlInput(e.target.value)}
                    required
                    style={{ fontSize: 12, width: 260 }}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={savingApplyUrl}>
                    {savingApplyUrl ? 'Saving…' : 'Add URL'}
                  </button>
                </form>
              )}
              {opp.is_demo_record && (
                <span className="btn btn-ghost btn-sm" style={{ opacity: 0.5, cursor: 'default', fontStyle: 'italic' }}>
                  📄 Demo record — no live posting URL
                </span>
              )}
            </div>
            {/* Source / Provenance Audit Block */}
            <div style={{
              background: 'var(--gray-50)',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 12,
              fontSize: 12,
              color: 'var(--gray-600)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13, color: '#1e3a5f' }}>
                🔎 Discovery provenance
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                <span><strong>Record type:</strong> {opp.is_demo_record ? '🧪 Demo' : '🟢 Live discovered'}</span>
                {opp.source_family && <span><strong>Source family:</strong> {opp.source_family}</span>}
                {opp.source_job_id && <span><strong>Source job ID:</strong> {opp.source_job_id}</span>}
                {opp.discovery_source_id && <span><strong>Source ID:</strong> {opp.discovery_source_id}</span>}
                {opp.discovered_at && (
                  <span><strong>Discovered:</strong> {new Date(opp.discovered_at).toLocaleString()}</span>
                )}
                {opp.ingested_at && !opp.discovered_at && (
                  <span><strong>Ingested:</strong> {new Date(opp.ingested_at).toLocaleString()}</span>
                )}
                {opp.canonical_job_url && (
                  <span style={{ gridColumn: '1 / -1' }}>
                    <strong>Canonical URL:</strong>{' '}
                    {opp.is_demo_record
                      ? <em style={{ color: '#9ca3af' }}>{opp.canonical_job_url} (demo — not live)</em>
                      : <a href={opp.canonical_job_url} target="_blank" rel="noopener noreferrer"
                           style={{ color: '#2563eb', wordBreak: 'break-all' }}>
                           {opp.canonical_job_url}
                         </a>
                    }
                  </span>
                )}
                {opp.application_url && opp.application_url !== opp.canonical_job_url && (
                  <span style={{ gridColumn: '1 / -1' }}>
                    <strong>Apply URL:</strong>{' '}
                    {opp.is_demo_record
                      ? <em style={{ color: '#9ca3af' }}>{opp.application_url} (demo)</em>
                      : <a href={opp.application_url} target="_blank" rel="noopener noreferrer"
                           style={{ color: '#2563eb', wordBreak: 'break-all' }}>
                           {opp.application_url}
                         </a>
                    }
                  </span>
                )}
              </div>
            </div>
            {opp.description && (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--gray-700)', whiteSpace: 'pre-wrap', background: 'var(--gray-50)', borderRadius: 6, padding: 12 }}>
                {opp.description}
              </div>
            )}
          </div>

          {/* Prep Package */}
          <div className="card">
            <div
              className="card-header"
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => { if (!prep) { loadPrep(); } else { setPrepOpen(p => !p); } }}
              role="button"
              aria-expanded={prepOpen}
            >
              <h2>📦 Preparation Package</h2>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {prepLoading ? 'Loading…' : prep ? (prepOpen ? '▲ Hide' : '▼ Show') : '▼ Generate'}
              </span>
            </div>
            {prep && prepOpen && (
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Next Action */}
                {prep.nextAction && (
                  <div style={{ background: prep.nextAction.priority === 'high' ? '#eff6ff' : 'var(--gray-50)', borderLeft: `3px solid ${prep.nextAction.priority === 'high' ? 'var(--blue)' : 'var(--gray-300)'}`, borderRadius: 4, padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>NEXT ACTION</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{prep.nextAction.action}</div>
                  </div>
                )}

                {/* Keyword Mirror */}
                {prep.keywordMirrorList?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 8 }}>KEYWORD MIRROR LIST</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {prep.keywordMirrorList.map((kw, i) => (
                        <span key={i} style={{ fontSize: 12, background: 'var(--blue-light, #dbeafe)', color: 'var(--blue-dark, #1e40af)', borderRadius: 4, padding: '2px 8px' }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resume / Summary Direction */}
                {prep.summaryDirection && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>SUMMARY DIRECTION</div>
                    <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.6, background: 'var(--gray-50)', borderRadius: 6, padding: 10 }}>
                      {prep.summaryDirection}
                    </div>
                  </div>
                )}

                {/* Proof Points */}
                {prep.proofPointsToSurface?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>PROOF POINTS TO SURFACE</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {prep.proofPointsToSurface.map((pp, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 6, lineHeight: 1.5 }}>{pp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Outreach Drafts */}
                {prep.outreach && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { key: 'recruiterDraft', label: '📧 Recruiter Outreach Draft' },
                      { key: 'hiringManagerDraft', label: '📧 Hiring Manager Outreach Draft' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>{label}</div>
                        <pre style={{ fontSize: 12, color: 'var(--gray-700)', background: 'var(--gray-50)', borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>
                          {prep.outreach[key]}
                        </pre>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', fontStyle: 'italic' }}>
                      ⚠ Outreach drafts require human review and personalisation before sending. Do NOT auto-send.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card card-pad">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Notes</h3>
            <textarea
              className="form-textarea w-full"
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes, prep reminders, or context..."
            />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveNotes} disabled={saving}>
              Save Notes
            </button>
          </div>

          {/* Approval Gate */}
          {opp.approval_state === 'pending' && (
            <div className="card card-pad" style={{ borderLeft: '3px solid var(--amber)', background: '#fffbeb' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>⚠ Approval Required</h3>
              <p style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 12 }}>
                This opportunity must be explicitly approved before any application action is taken.
              </p>
              <input
                className="form-input w-full"
                placeholder="Optional reason / note"
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{ marginBottom: 10 }}
              />
              <div className="flex gap-2">
                <button className="btn btn-success" disabled={saving} onClick={() => handleApprove('approve')}>✓ Approve</button>
                <button className="btn btn-danger" disabled={saving} onClick={() => handleApprove('reject')}>✕ Reject</button>
              </div>
            </div>
          )}

          {/* Human Override Audit */}
          {opp.human_override && (
            <div className="card card-pad" style={{ background: 'var(--gray-50)' }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📋 Audit Trail</h3>
              <div style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                <div>Action: <strong>{opp.human_override.action}</strong></div>
                <div>Decided: {new Date(opp.human_override.decided_at).toLocaleString()}</div>
                {opp.human_override.reason && <div>Reason: {opp.human_override.reason}</div>}
                <div>Original score: {opp.human_override.original_fit_score} · Original rec: {opp.human_override.original_recommendation ? 'Yes' : 'No'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card-pad">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Scoring Details</h3>
            <Field label="Fit Score">{opp.fit_score}/100</Field>
            <Field label="Lane">{opp.lane?.replace(/_/g, ' ')}</Field>
            <Field label="Resume Emphasis">{getResumeEmphasisLabel(opp.resume_emphasis)}</Field>
            <Field label="Recommended">{opp.recommended ? '✓ Yes' : '✗ No'}</Field>
            <div style={{ marginBottom: 14 }}>
              <div className="detail-label">Score Signals</div>
              <div className="signals-list" style={{ marginTop: 4 }}>
                {(opp.fit_signals || []).map((s, i) => (
                  <span key={i} className="signal-chip">{s}</span>
                ))}
              </div>
            </div>
            {opp.recommendation_text && (
              <div style={{ fontSize: 12, color: 'var(--gray-700)', background: 'var(--gray-50)', borderRadius: 6, padding: 10, lineHeight: 1.5 }}>
                {opp.recommendation_text}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Tracking</h3>
            <Field label="Source">{opp.source}</Field>
            <Field label="Ingested">{new Date(opp.ingested_at).toLocaleDateString()}</Field>
            <Field label="Approval State">{opp.approval_state}</Field>
            {opp.applied_date && <Field label="Applied">{new Date(opp.applied_date).toLocaleDateString()}</Field>}
            {opp.last_action_date && <Field label="Last Action">{new Date(opp.last_action_date).toLocaleDateString()}</Field>}
            {opp.next_action && (
              <>
                <Field label="Next Action">{opp.next_action}</Field>
                {opp.next_action_due && <Field label="Due">{opp.next_action_due}</Field>}
              </>
            )}
            {opp.stale_flag && (
              <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-light)', borderRadius: 6, padding: 8, marginTop: 8 }}>
                ⚠ {opp.stale_reason || 'Flagged stale — follow up or close.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
