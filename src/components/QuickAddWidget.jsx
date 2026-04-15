/**
 * QuickAddWidget — compact inline Quick Add entry point for Dashboard.
 *
 * Provides fast paste-based intake without leaving the current view.
 * Supports: reference URL, title, company, JD text, optional apply URL.
 * Detects LinkedIn URLs immediately and shows safe-use notice.
 * Does NOT scrape LinkedIn — all intake is paste-based.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { quickAddOpportunity } from '../lib/api.js';

const EMPTY = { reference_posting_url: '', title: '', company: '', pasted_jd_text: '', external_apply_url: '' };

function isLinkedIn(url = '') { return /linkedin\.com/i.test(url); }

export default function QuickAddWidget() {
  const { loadOpportunities, notify } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);

  const upd = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const linkedInRef = isLinkedIn(form.reference_posting_url);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await quickAddOpportunity(form);
      if (data.duplicate) {
        notify('Already in queue — deduplicated.', 'warning');
        setDone({ duplicate: true });
      } else {
        await loadOpportunities();
        notify('Role added and queued for approval.', 'success');
        setDone({ opp: data.opportunity, isLinkedIn: data.intake_source_is_linkedin });
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setForm(EMPTY); setDone(null); setOpen(false); };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="card-header"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => { setOpen(o => !o); setDone(null); }}
      >
        <h2 style={{ margin: 0, fontSize: 14 }}>⚡ Quick Add Job</h2>
        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
          {open ? '▲ collapse' : '▼ add from LinkedIn / external posting'}
        </span>
      </div>

      {open && (
        <div className="card-body">
          {/* Post-submit success */}
          {done && !done.duplicate && done.opp && (
            <div>
              <div style={{ color: 'var(--green, #16a34a)', fontWeight: 700, marginBottom: 10 }}>
                ✓ {done.opp.title} at {done.opp.company} — score {done.opp.fit_score ?? '?'} · {done.opp.lane?.replace(/_/g, ' ')}
              </div>
              {done.isLinkedIn && (
                <div style={{ fontSize: 12, color: 'var(--blue-700, #1d4ed8)', marginBottom: 8 }}>
                  LinkedIn reference stored — system did NOT access LinkedIn.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/queue')}>
                  Review in Approval Queue
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/opportunity/${done.opp.id}`)}>
                  View Opportunity
                </button>
                <button className="btn btn-ghost btn-sm" onClick={reset}>Add Another</button>
              </div>
            </div>
          )}

          {done && done.duplicate && (
            <div>
              <div style={{ color: 'var(--amber, #d97706)', fontWeight: 600, marginBottom: 10 }}>
                ⚠ Already in queue — not duplicated.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/queue')}>Go to Queue</button>
                <button className="btn btn-ghost btn-sm" onClick={reset}>Add a Different Role</button>
              </div>
            </div>
          )}

          {!done && (
            <>
              {/* LinkedIn notice */}
              <div style={{ fontSize: 12, color: 'var(--blue-800, #1e40af)', background: 'var(--blue-50, #eff6ff)',
                border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 5, padding: '7px 10px', marginBottom: 12 }}>
                Paste the job URL and JD text below. LinkedIn URLs are stored as reference only — nothing is fetched.
              </div>

              <form onSubmit={handleSubmit}>
                {/* Reference URL */}
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ fontSize: 12 }} htmlFor="qaw-url">
                    Reference URL <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    id="qaw-url" type="url" className="form-input" required
                    placeholder="https://linkedin.com/jobs/view/... or company.com/careers/..."
                    value={form.reference_posting_url} onChange={upd('reference_posting_url')}
                    style={{ fontSize: 13 }}
                  />
                  {linkedInRef && (
                    <div style={{ fontSize: 11, color: 'var(--blue-700, #1d4ed8)', marginTop: 3 }}>
                      ℹ LinkedIn URL — reference only. Paste JD text + apply URL below.
                    </div>
                  )}
                </div>

                {/* Title + Company */}
                <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }} htmlFor="qaw-title">
                      Role title <span style={{ color: 'red' }}>*</span>
                    </label>
                    <input id="qaw-title" type="text" className="form-input" required
                      placeholder="e.g. Technical Project Manager"
                      value={form.title} onChange={upd('title')} style={{ fontSize: 13 }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: 12 }} htmlFor="qaw-company">
                      Company <span style={{ color: 'red' }}>*</span>
                    </label>
                    <input id="qaw-company" type="text" className="form-input" required
                      placeholder="e.g. Atlassian"
                      value={form.company} onChange={upd('company')} style={{ fontSize: 13 }} />
                  </div>
                </div>

                {/* Apply URL */}
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label" style={{ fontSize: 12 }} htmlFor="qaw-apply">
                    Apply URL <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>(optional — paste direct ATS link if available)</span>
                  </label>
                  <input id="qaw-apply" type="url" className="form-input"
                    placeholder="https://boards.greenhouse.io/... (optional)"
                    value={form.external_apply_url} onChange={upd('external_apply_url')} style={{ fontSize: 13 }} />
                </div>

                {/* JD Text */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontSize: 12 }} htmlFor="qaw-jd">
                    Job description text <span style={{ color: 'red' }}>*</span>
                    <span style={{ fontSize: 11, color: 'var(--gray-500)', marginLeft: 4 }}>(paste from posting — used for scoring)</span>
                  </label>
                  <textarea id="qaw-jd" className="form-input" required
                    placeholder="Paste the full job description here…"
                    value={form.pasted_jd_text} onChange={upd('pasted_jd_text')}
                    rows={5} style={{ resize: 'vertical', fontSize: 13 }} />
                  {form.pasted_jd_text.length > 0 && (
                    <div style={{ fontSize: 11, color: form.pasted_jd_text.length < 200 ? 'var(--amber, #d97706)' : 'var(--gray-400)', marginTop: 2 }}>
                      {form.pasted_jd_text.length < 200 ? '⚠ Short — paste more for better scoring' : `✓ ${form.pasted_jd_text.length} chars`}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                    {loading ? 'Scoring…' : 'Add to Queue →'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/quick-add')}>
                    Full Form
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                    Cancel
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
