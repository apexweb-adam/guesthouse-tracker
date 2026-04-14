import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { quickAddOpportunity } from '../lib/api.js';

const EMPTY_FORM = {
  reference_posting_url: '',
  pasted_jd_text: '',
  external_apply_url: '',
  title: '',
  company: '',
  location: '',
  notes: '',
};

function isLinkedInUrl(url = '') {
  return /linkedin\.com/i.test(url);
}

export default function QuickAdd() {
  const { loadOpportunities, loadLogs, notify } = useApp();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const linkedInRef = isLinkedInUrl(form.reference_posting_url);

  const update = (key) => (e) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const data = await quickAddOpportunity(form);
      setResult(data);

      if (data.duplicate) {
        notify('Already in your queue — not added again (deduplicated).', 'warning');
      } else {
        await loadOpportunities();
        await loadLogs();
        notify('Role added and queued for your approval.', 'success');
        // Show success state then optionally navigate to queue
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddAnother = () => {
    setForm(EMPTY_FORM);
    setResult(null);
  };

  // ── Success state ────────────────────────────────────────────────────────────
  if (result && !result.duplicate && result.opportunity) {
    const opp = result.opportunity;
    return (
      <div>
        <h1 className="section-title">Quick Add Job</h1>

        <div className="card" style={{ maxWidth: 680 }}>
          <div className="card-header">
            <h2 style={{ color: 'var(--success, #16a34a)' }}>✓ Role Added</h2>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: 16, color: 'var(--gray-700)' }}>
              <strong>{opp.title}</strong> at <strong>{opp.company}</strong> has been scored and
              queued for your approval.
            </p>

            {result.intake_source_is_linkedin && (
              <div className="badge badge-info" style={{ marginBottom: 12, display: 'inline-block' }}>
                LinkedIn reference stored — system did NOT access LinkedIn
              </div>
            )}

            <div className="grid-2" style={{ gap: 12, marginBottom: 16 }}>
              <div className="stat-box">
                <div className="stat-label">Lane</div>
                <div className="stat-value">{opp.lane?.replace(/_/g, ' ') || '—'}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Fit Score</div>
                <div className="stat-value">{opp.fit_score ?? '—'}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Recommended</div>
                <div className="stat-value">{opp.recommended ? '✓ Yes' : '✗ No'}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Approval Status</div>
                <div className="stat-value">Pending review</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/queue')}
              >
                Review in Approval Queue →
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/opportunity/${opp.id}`)}
              >
                View Opportunity
              </button>
              <button className="btn btn-ghost" onClick={handleAddAnother}>
                Add Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Duplicate state ──────────────────────────────────────────────────────────
  if (result && result.duplicate) {
    return (
      <div>
        <h1 className="section-title">Quick Add Job</h1>
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="card-header">
            <h2 style={{ color: 'var(--warning, #d97706)' }}>⚠ Already in Queue</h2>
          </div>
          <div className="card-body">
            <p style={{ marginBottom: 16 }}>
              This role already exists in your queue. No duplicate was created.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate('/queue')}>
                Go to Approval Queue
              </button>
              <button className="btn btn-ghost" onClick={handleAddAnother}>
                Add a Different Role
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="section-title">Quick Add Job</h1>
      <p className="section-sub">
        Found a role on LinkedIn or another site? Paste the job description here.
        The system will score it and queue it for your approval — no scraping involved.
      </p>

      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-header">
          <h2>Add from External Posting</h2>
        </div>
        <div className="card-body">
          {/* Safe-use notice */}
          <div
            className="alert alert-info"
            style={{
              background: 'var(--blue-50, #eff6ff)',
              border: '1px solid var(--blue-200, #bfdbfe)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--blue-800, #1e40af)',
            }}
          >
            <strong>How this works:</strong> Paste the posting URL and the full job description text.
            The system classifies the role, scores it, and adds it to your approval queue.
            LinkedIn URLs are accepted as a reference only — nothing is fetched automatically.
          </div>

          <form onSubmit={handleSubmit}>
            {/* Reference URL */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="qa-ref-url">
                Reference posting URL <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                id="qa-ref-url"
                type="url"
                className="form-input"
                placeholder="https://www.linkedin.com/jobs/view/... or https://company.com/careers/..."
                value={form.reference_posting_url}
                onChange={update('reference_posting_url')}
                required
              />
              {linkedInRef && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--blue-700, #1d4ed8)' }}>
                  ℹ LinkedIn URL detected — stored as reference only. The system will not access LinkedIn.
                  Paste the full job description below and provide the apply URL if available.
                </div>
              )}
            </div>

            {/* Role title + Company (side by side) */}
            <div className="grid-2" style={{ marginBottom: 16, gap: 12 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="qa-title">
                  Role title <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="qa-title"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Technical Project Manager"
                  value={form.title}
                  onChange={update('title')}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="qa-company">
                  Company <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  id="qa-company"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Atlassian"
                  value={form.company}
                  onChange={update('company')}
                  required
                />
              </div>
            </div>

            {/* Location */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="qa-location">Location</label>
              <input
                id="qa-location"
                type="text"
                className="form-input"
                placeholder="e.g. Sydney NSW, Remote"
                value={form.location}
                onChange={update('location')}
              />
            </div>

            {/* External apply URL */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="qa-apply-url">
                External apply URL
                <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--gray-500)' }}>
                  (recommended — paste the direct company apply link if different from the reference URL)
                </span>
              </label>
              <input
                id="qa-apply-url"
                type="url"
                className="form-input"
                placeholder="https://boards.greenhouse.io/company/jobs/123 (optional)"
                value={form.external_apply_url}
                onChange={update('external_apply_url')}
              />
            </div>

            {/* JD text */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label" htmlFor="qa-jd-text">
                Job description text <span style={{ color: 'red' }}>*</span>
                <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--gray-500)' }}>
                  (paste the full text from the job posting — used for scoring)
                </span>
              </label>
              <textarea
                id="qa-jd-text"
                className="form-input"
                placeholder="Paste the full job description here. The system uses this text to classify the role, score the fit, and recommend the best resume version."
                value={form.pasted_jd_text}
                onChange={update('pasted_jd_text')}
                rows={10}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                required
              />
              {form.pasted_jd_text.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                  {form.pasted_jd_text.length} characters — {form.pasted_jd_text.length < 200
                    ? '⚠ Short — paste more text for better scoring accuracy'
                    : '✓ Enough text for classification'}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label" htmlFor="qa-notes">Notes (optional)</label>
              <input
                id="qa-notes"
                type="text"
                className="form-input"
                placeholder="e.g. Saw this via recruiter DM, fits team I'm targeting"
                value={form.notes}
                onChange={update('notes')}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ minWidth: 160 }}
            >
              {loading ? 'Scoring & adding…' : 'Add to Queue →'}
            </button>
          </form>
        </div>
      </div>

      {/* How it works */}
      <div className="card" style={{ maxWidth: 720, marginTop: 20 }}>
        <div className="card-header">
          <h2 style={{ fontSize: 14 }}>Workflow</h2>
        </div>
        <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--gray-600)' }}>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            <li>Paste the reference URL and full JD text</li>
            <li>System classifies the role (TPM / Delivery / Ops / etc.) and scores fit</li>
            <li>Role is queued for <strong>your approval</strong> — nothing is applied to automatically</li>
            <li>After approval, Apply Pack is auto-generated with resume recommendation, keywords, outreach drafts</li>
            <li>You review the pack, then decide when and how to apply</li>
          </ol>
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--gray-50, #f9fafb)', borderRadius: 4, fontSize: 12 }}>
            <strong>LinkedIn policy:</strong> This feature does not access LinkedIn. The LinkedIn URL is stored only as a reference.
            Pasting from LinkedIn is safe and compliant with this product's rules.
          </div>
        </div>
      </div>
    </div>
  );
}
