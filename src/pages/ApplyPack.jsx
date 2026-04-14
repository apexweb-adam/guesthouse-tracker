import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import FitScoreBadge from '../components/FitScoreBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import LaneBadge from '../components/LaneBadge.jsx';
import {
  fetchApplyPack,
  regenerateApplyPackApi,
  overrideResumeVersion,
  updateChecklistItem,
  updateApplyStatus,
} from '../lib/api.js';
import { RESUME_VERSIONS, RESUME_VERSION_LABELS } from '../../netlify/functions/_shared/scoring.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONFIDENCE_COLOR = { high: 'var(--green)', medium: 'var(--amber)', low: 'var(--red)' };
const CONFIDENCE_BG = { high: '#f0fdf4', medium: '#fffbeb', low: '#fef2f2' };

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={copy} style={{ fontSize: 11 }}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function Section({ title, children, actionSlot }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', margin: 0 }}>{title}</h3>
        {actionSlot}
      </div>
      {children}
    </div>
  );
}

// ─── Override Resume Modal ────────────────────────────────────────────────────

function OverrideResumeModal({ current, original, onSave, onClose }) {
  const [version, setVersion] = useState(current || original);
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card card-pad" style={{ maxWidth: 440, width: '100%', margin: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Override Resume Version</h3>
        <div style={{ fontSize: 12, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 6, padding: 8, marginBottom: 14 }}>
          System recommendation: <strong>{original}</strong>
          {' — '}
          {RESUME_VERSION_LABELS[original] || original}
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>
          Override version
        </label>
        <select
          className="form-input w-full"
          value={version}
          onChange={e => setVersion(e.target.value)}
          style={{ marginBottom: 10 }}
        >
          {Object.entries(RESUME_VERSION_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{v} — {label}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>
          Reason (required)
        </label>
        <textarea
          className="form-textarea w-full"
          rows={2}
          placeholder="Why are you overriding the system recommendation?"
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => reason.trim() && onSave(version, reason)}
            disabled={!reason.trim() || version === original}
          >
            Save Override
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        </div>
        {version === original && (
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 8 }}>
            Select a different version to override.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ApplyPack() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, loadOpportunities, notify } = useApp();

  const [pack, setPack] = useState(null);
  const [opp, setOppLocal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApplyPack(id);
      setPack(res.apply_pack);
      setOppLocal(res.opportunity);
      if (res.generated) await loadOpportunities();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, loadOpportunities, notify]);

  useEffect(() => { load(); }, [load]);

  // Fall back to store if local opp not set
  const storeOpp = state.opportunities.find(o => o.id === id);
  const opportunity = opp || storeOpp;

  const effectiveResume = pack?.resume_version_override || pack?.recommended_resume_version;
  const isOverridden = !!pack?.resume_version_override;

  const handleToggleChecklist = async (itemId, done) => {
    if (!pack) return;
    setSaving(true);
    try {
      const res = await updateChecklistItem(id, itemId, done);
      setPack(res.apply_pack);
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (status) => {
    setSaving(true);
    try {
      await updateApplyStatus(id, status);
      await loadOpportunities();
      notify(`Status updated to "${status}".`, 'success');
      load();
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleRegenerate = async () => {
    setSaving(true);
    try {
      const res = await regenerateApplyPackApi(id);
      setPack(res.apply_pack);
      await loadOpportunities();
      notify('Apply Pack regenerated.', 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleOverrideSave = async (version, reason) => {
    setSaving(true);
    try {
      const res = await overrideResumeVersion(id, version, reason);
      setPack(res.apply_pack);
      setShowOverrideModal(false);
      notify('Resume version override saved.', 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleExport = () => {
    if (!pack || !opportunity) return;
    const exportData = {
      opportunity: {
        title: opportunity.title,
        company: opportunity.company,
        url: opportunity.url,
        lane: opportunity.lane,
        fit_score: opportunity.fit_score,
        status: opportunity.status,
      },
      apply_pack: pack,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apply-pack-${opportunity.company || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Apply Pack exported.', 'success');
  };

  if (loading) {
    return (
      <div className="card card-pad" style={{ color: 'var(--gray-500)', fontSize: 13 }}>
        Generating Apply Pack…
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="card card-pad">
        <div style={{ color: 'var(--gray-600)', fontSize: 13, marginBottom: 12 }}>
          No Apply Pack available.{' '}
          {opportunity?.approval_state !== 'approved'
            ? 'This opportunity must be approved before a pack can be generated.'
            : 'Click the button below to generate.'}
        </div>
        {opportunity?.approval_state === 'approved' && (
          <button className="btn btn-primary" onClick={load}>Generate Apply Pack</button>
        )}
        {opportunity?.approval_state !== 'approved' && (
          <Link to="/queue" className="btn btn-secondary">Go to Approval Queue</Link>
        )}
      </div>
    );
  }

  const checklist = pack.apply_checklist || [];
  const doneCount = checklist.filter(c => c.done).length;
  const allDone = doneCount === checklist.length && checklist.length > 0;

  const TABS = [
    { id: 'overview', label: '📋 Overview' },
    { id: 'resume', label: '📄 Resume' },
    { id: 'outreach', label: '📧 Outreach' },
    { id: 'checklist', label: `✅ Checklist (${doneCount}/${checklist.length})` },
  ];

  return (
    <div>
      {/* Back nav */}
      <div className="flex gap-2" style={{ marginBottom: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => nav(-1)}>← Back</button>
        <Link to={`/opportunity/${id}`} className="btn btn-ghost btn-sm">View Detail</Link>
      </div>

      {/* Header card */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
          <FitScoreBadge score={opportunity?.fit_score} />
          {opportunity?.lane && <LaneBadge lane={opportunity.lane} />}
          {opportunity?.status && <StatusBadge status={opportunity.status} />}
          {isOverridden && (
            <span className="badge" style={{ background: '#fffbeb', color: 'var(--amber)', border: '1px solid var(--amber)', fontSize: 11 }}>
              ⚠ Resume Overridden
            </span>
          )}
          <span className="badge" style={{ background: '#eff6ff', color: 'var(--blue)', fontSize: 11 }}>
            📦 Pack v{pack.pack_version || 1}
          </span>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{opportunity?.title}</h1>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 8 }}>
          {opportunity?.company}{opportunity?.location ? ` · ${opportunity.location}` : ''}
        </div>
        {opportunity?.url && (
          <a href={opportunity.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            View Posting ↗
          </a>
        )}
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
          Pack generated {new Date(pack.generated_at).toLocaleString()}
          {pack.pack_version > 1 && ` · Last regenerated ${new Date(pack.last_regenerated_at).toLocaleString()}`}
          {' · '}System v{pack.generated_by_system_version}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {opportunity?.status === 'apply_pack_generated' && (
          <button className="btn btn-primary btn-sm" disabled={saving}
            onClick={() => handleStatusChange('ready_to_apply')}>
            ✓ Mark Ready to Apply
          </button>
        )}
        {(opportunity?.status === 'ready_to_apply' || opportunity?.status === 'apply_pack_generated') && (
          <button className="btn btn-success btn-sm" disabled={saving}
            onClick={() => handleStatusChange('applied')}>
            🚀 Mark Applied
          </button>
        )}
        {opportunity?.status === 'applied' && (
          <button className="btn btn-secondary btn-sm" disabled={saving}
            onClick={() => handleStatusChange('follow_up_1')}>
            📬 Mark Follow-Up 1 Sent
          </button>
        )}
        {opportunity?.status === 'follow_up_1' && (
          <button className="btn btn-secondary btn-sm" disabled={saving}
            onClick={() => handleStatusChange('follow_up_2')}>
            📬 Mark Follow-Up 2 Sent
          </button>
        )}
        {['apply_pack_generated', 'ready_to_apply', 'approved'].includes(opportunity?.status) && (
          <button className="btn btn-secondary btn-sm" disabled={saving} onClick={handleRegenerate}>
            🔄 Regenerate Pack
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>⬇ Export Pack JSON</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div>
          {/* Resume Recommendation Banner */}
          <div style={{
            background: isOverridden ? '#fffbeb' : CONFIDENCE_BG[pack.recommendation_confidence] || '#f0fdf4',
            border: `1px solid ${isOverridden ? 'var(--amber)' : CONFIDENCE_COLOR[pack.recommendation_confidence] || 'var(--green)'}`,
            borderRadius: 8, padding: 14, marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 4 }}>
                  {isOverridden ? '⚠ OVERRIDDEN RESUME VERSION' : 'RECOMMENDED RESUME VERSION'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 2 }}>
                  {effectiveResume}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 6 }}>
                  {RESUME_VERSION_LABELS[effectiveResume] || effectiveResume}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: CONFIDENCE_COLOR[pack.recommendation_confidence] + '20', borderRadius: 4, padding: '2px 8px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONFIDENCE_COLOR[pack.recommendation_confidence], display: 'inline-block' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: CONFIDENCE_COLOR[pack.recommendation_confidence] }}>
                    {pack.recommendation_confidence?.toUpperCase()} CONFIDENCE
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 8, lineHeight: 1.5 }}>
                  {pack.recommendation_reason}
                </div>
                {isOverridden && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>
                    <strong>Override reason:</strong> {pack.resume_version_override_reason}
                    {pack.resume_version_override_at && (
                      <span style={{ color: 'var(--gray-400)', marginLeft: 8 }}>
                        — {new Date(pack.resume_version_override_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
                {isOverridden && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray-500)' }}>
                    Original system recommendation: <strong>{pack.original_system_recommendation}</strong>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => setShowOverrideModal(true)}>
                  ✎ Override
                </button>
              </div>
            </div>
          </div>

          {/* Next action */}
          {pack.next_action && (
            <Section title="NEXT ACTION">
              <div style={{
                background: pack.next_action.priority === 'high' ? '#eff6ff' : 'var(--gray-50)',
                borderLeft: `3px solid ${pack.next_action.priority === 'high' ? 'var(--blue)' : 'var(--gray-300)'}`,
                borderRadius: 4, padding: 10, fontSize: 13, fontWeight: 500,
              }}>
                {pack.next_action.action}
              </div>
              {pack.suggested_follow_up_date && (
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8 }}>
                  Suggested follow-up date: <strong>{pack.suggested_follow_up_date}</strong>
                </div>
              )}
            </Section>
          )}

          {/* Keywords */}
          {pack.keyword_mirror_list?.length > 0 && (
            <Section title="KEYWORD MIRROR LIST"
              actionSlot={<CopyButton text={pack.keyword_mirror_list.join(', ')} label="Copy All" />}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pack.keyword_mirror_list.map((kw, i) => (
                  <span key={i} style={{
                    fontSize: 12, background: '#dbeafe', color: '#1e40af',
                    borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                  }}
                    onClick={() => navigator.clipboard.writeText(kw)}
                    title="Click to copy"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Proof points */}
          {pack.proof_points_to_surface?.length > 0 && (
            <Section title="PROOF POINTS TO SURFACE">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {pack.proof_points_to_surface.map((pp, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 6, lineHeight: 1.5 }}>
                    {pp}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Summary direction */}
          {pack.summary_direction && (
            <Section title="SUMMARY DIRECTION"
              actionSlot={<CopyButton text={pack.summary_direction} />}
            >
              <div style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.6, background: 'var(--gray-50)', borderRadius: 6, padding: 10 }}>
                {pack.summary_direction}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── RESUME TAB ── */}
      {activeTab === 'resume' && (
        <div>
          <Section title="ACTIVE RESUME VERSION">
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{effectiveResume}</div>
            <div style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 10 }}>
              {RESUME_VERSION_LABELS[effectiveResume] || effectiveResume}
            </div>
            {isOverridden ? (
              <div style={{ fontSize: 12, background: '#fffbeb', border: '1px solid var(--amber)', borderRadius: 6, padding: 8, marginBottom: 10 }}>
                <strong>⚠ Override active.</strong> Original recommendation was <strong>{pack.original_system_recommendation}</strong>.
                <br />Override reason: {pack.resume_version_override_reason}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
                System-generated recommendation. No override applied.
              </div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowOverrideModal(true)}>
              ✎ Change Resume Version
            </button>
          </Section>

          {pack.bullet_emphasis_notes?.length > 0 && (
            <Section title="BULLET EMPHASIS NOTES">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {pack.bullet_emphasis_notes.map((note, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 8, lineHeight: 1.5 }}>
                    {note}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* All resume versions for comparison */}
          <Section title="ALL RESUME VERSIONS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(RESUME_VERSION_LABELS).map(([v, label]) => (
                <div key={v} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 6, background: v === effectiveResume ? '#eff6ff' : 'var(--gray-50)',
                  border: v === effectiveResume ? '1px solid var(--blue)' : '1px solid var(--gray-100)',
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', minWidth: 110 }}>{v}</span>
                  <span style={{ color: 'var(--gray-600)', flex: 1 }}>{label}</span>
                  {v === pack.recommended_resume_version && (
                    <span style={{ fontSize: 11, color: 'var(--green)' }}>System rec</span>
                  )}
                  {v === effectiveResume && v !== pack.recommended_resume_version && (
                    <span style={{ fontSize: 11, color: 'var(--amber)' }}>Override</span>
                  )}
                  {v === effectiveResume && v === pack.recommended_resume_version && (
                    <span style={{ fontSize: 11, color: 'var(--blue)' }}>Active</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ── OUTREACH TAB ── */}
      {activeTab === 'outreach' && (
        <div>
          {[
            { key: 'recruiter_outreach_draft', label: '📧 Recruiter Outreach Draft' },
            { key: 'hiring_manager_outreach_draft', label: '📧 Hiring Manager Outreach Draft' },
          ].map(({ key, label }) => (
            <Section key={key} title={label} actionSlot={<CopyButton text={pack[key] || ''} />}>
              <pre style={{
                fontSize: 12, color: 'var(--gray-700)', background: 'var(--gray-50)', borderRadius: 6,
                padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, fontFamily: 'inherit',
              }}>
                {pack[key]}
              </pre>
            </Section>
          ))}
          <div style={{ fontSize: 11, color: 'var(--gray-400)', fontStyle: 'italic', marginTop: 8 }}>
            ⚠ Outreach drafts require human review and personalisation before sending. Do NOT auto-send.
          </div>
        </div>
      )}

      {/* ── CHECKLIST TAB ── */}
      {activeTab === 'checklist' && (
        <div>
          {allDone && (
            <div style={{
              background: '#f0fdf4', border: '1px solid var(--green)', borderRadius: 8, padding: 12,
              fontSize: 13, color: 'var(--green)', fontWeight: 600, marginBottom: 14,
            }}>
              ✓ All checklist items complete — ready to apply!
            </div>
          )}

          <Section title={`APPLY CHECKLIST — ${doneCount}/${checklist.length} done`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                    padding: '8px 10px', borderRadius: 6,
                    background: item.done ? '#f0fdf4' : 'var(--gray-50)',
                    border: `1px solid ${item.done ? 'var(--green)' : 'var(--gray-100)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={e => handleToggleChecklist(item.id, e.target.checked)}
                    disabled={saving}
                    style={{ marginTop: 2, accentColor: 'var(--green)' }}
                  />
                  <span style={{
                    fontSize: 13, color: item.done ? 'var(--gray-500)' : 'var(--gray-800)',
                    textDecoration: item.done ? 'line-through' : 'none', lineHeight: 1.5,
                  }}>
                    {item.step}
                  </span>
                </label>
              ))}
            </div>
          </Section>

          {/* Follow-up date reminder */}
          {pack.suggested_follow_up_date && (
            <div className="card card-pad" style={{ background: '#eff6ff', borderLeft: '3px solid var(--blue)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>
                SUGGESTED FOLLOW-UP DATE
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)' }}>
                {pack.suggested_follow_up_date}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                Add this to your calendar. Follow up if no response by this date.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Override modal */}
      {showOverrideModal && (
        <OverrideResumeModal
          current={pack.resume_version_override}
          original={pack.original_system_recommendation || pack.recommended_resume_version}
          onSave={handleOverrideSave}
          onClose={() => setShowOverrideModal(false)}
        />
      )}
    </div>
  );
}
