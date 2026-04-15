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
  updateApplyUrl,
} from '../lib/api.js';
import { RESUME_VERSIONS, RESUME_VERSION_LABELS } from '../../netlify/functions/_shared/scoring.js';
import { computePackReadinessScore } from '../../netlify/functions/_shared/applyPack.js';

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
  const [addUrlValue, setAddUrlValue] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
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
        location: opportunity.location,
        canonical_job_url: opportunity.canonical_job_url || opportunity.url || null,
        application_url: opportunity.application_url || null,
        source_family: opportunity.source_family || null,
        source_job_id: opportunity.source_job_id || null,
        is_demo_record: opportunity.is_demo_record || false,
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

  const handlePrintExport = () => {
    if (!pack || !opportunity) return;
    const lines = [];
    const sep = '='.repeat(60);
    const sub = '-'.repeat(40);
    lines.push(sep);
    lines.push(`APPLY PACK — ${opportunity.title}`);
    lines.push(`Company: ${opportunity.company || '—'}`);
    if (opportunity.location) lines.push(`Location: ${opportunity.location}`);
    lines.push(`Lane: ${opportunity.lane || '—'}  |  Fit Score: ${opportunity.fit_score ?? '—'}`);
    lines.push(`Status: ${opportunity.status || '—'}`);
    lines.push(`Pack version: ${pack.pack_version || 1}  |  Generated: ${pack.generated_at ? new Date(pack.generated_at).toLocaleDateString() : '—'}`);
    if (opportunity.canonical_job_url || opportunity.url) {
      lines.push(`Original Posting: ${opportunity.canonical_job_url || opportunity.url}`);
    }
    if (opportunity.application_url) {
      lines.push(`Apply URL: ${opportunity.application_url}`);
    } else {
      lines.push(`Apply URL: ⚠ MISSING — find official ATS/careers link before applying`);
    }
    lines.push(sep);
    lines.push('');
    lines.push('RECOMMENDED RESUME VERSION');
    lines.push(sub);
    lines.push(`${pack.recommended_resume_version || '—'} (${RESUME_VERSION_LABELS[pack.recommended_resume_version] || ''})`);
    lines.push(`Confidence: ${(pack.recommendation_confidence || '').toUpperCase()}`);
    if (pack.recommendation_reason) lines.push(`Reason: ${pack.recommendation_reason}`);
    if (pack.resume_version_override) {
      lines.push(`⚠ Override: ${pack.resume_version_override}`);
      lines.push(`Override reason: ${pack.resume_version_override_reason || '—'}`);
      lines.push(`Original system recommendation: ${pack.original_system_recommendation}`);
    }
    lines.push('');
    if (pack.copy_ready_summary_block) {
      lines.push('COPY-READY SUMMARY BLOCK');
      lines.push(sub);
      lines.push(pack.copy_ready_summary_block);
      lines.push('');
    }
    if (pack.copy_ready_resume_emphasis_block) {
      lines.push('COPY-READY RESUME EMPHASIS BLOCK');
      lines.push(sub);
      lines.push(pack.copy_ready_resume_emphasis_block);
      lines.push('');
    }
    if (pack.keyword_mirror_list?.length) {
      lines.push('KEYWORD MIRROR LIST');
      lines.push(sub);
      lines.push(pack.keyword_mirror_list.join(', '));
      lines.push('');
    }
    if (pack.proof_points_to_surface?.length) {
      lines.push('PROOF POINTS TO SURFACE');
      lines.push(sub);
      pack.proof_points_to_surface.forEach((pp, i) => lines.push(`${i + 1}. ${pp}`));
      lines.push('');
    }
    if (pack.summary_direction) {
      lines.push('SUMMARY DIRECTION');
      lines.push(sub);
      lines.push(pack.summary_direction);
      lines.push('');
    }
    if (pack.bullet_emphasis_notes?.length) {
      lines.push('BULLET EMPHASIS NOTES');
      lines.push(sub);
      pack.bullet_emphasis_notes.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
      lines.push('');
    }
    if (pack.recruiter_outreach_draft) {
      lines.push('RECRUITER OUTREACH DRAFT');
      lines.push(sub);
      lines.push(pack.recruiter_outreach_draft);
      lines.push('');
    }
    if (pack.hiring_manager_outreach_draft) {
      lines.push('HIRING MANAGER OUTREACH DRAFT');
      lines.push(sub);
      lines.push(pack.hiring_manager_outreach_draft);
      lines.push('');
    }
    if (pack.apply_checklist?.length) {
      lines.push('APPLY CHECKLIST');
      lines.push(sub);
      pack.apply_checklist.forEach(item => {
        lines.push(`[${item.done ? 'x' : ' '}] ${item.step}`);
      });
      lines.push('');
    }
    if (pack.suggested_follow_up_date) {
      lines.push(`Suggested follow-up date: ${pack.suggested_follow_up_date}`);
      lines.push('');
    }
    lines.push(sep);
    lines.push('⚠ All drafted content requires human review before use.');
    lines.push('Do NOT auto-submit applications or outreach.');
    lines.push(sep);

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = `apply-pack-${opportunity.company || 'export'}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(dlUrl);
    notify('Apply Pack exported as text file.', 'success');
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
  const packReadiness = computePackReadinessScore(opportunity || {}, pack);

  const TABS = [
    { id: 'overview', label: '📋 Overview' },
    { id: 'copyready', label: '✍ Copy-Ready' },
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
        {/* Real URL buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          {(opportunity?.canonical_job_url || opportunity?.url) && !opportunity?.is_demo_record && (
            <a
              href={opportunity.canonical_job_url || opportunity.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
            >
              📄 Open Original Posting ↗
            </a>
          )}
          {opportunity?.application_url && opportunity.application_url !== (opportunity?.canonical_job_url || opportunity?.url) && !opportunity?.is_demo_record && (
            <a
              href={opportunity.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              ✅ Open Apply URL ↗
            </a>
          )}
          {opportunity?.is_demo_record && (
            <span style={{ fontSize: 12, color: 'var(--amber)', fontStyle: 'italic' }}>
              ⚠ Demo record — no live application URL
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
          Pack generated {new Date(pack.generated_at).toLocaleString()}
          {pack.pack_version > 1 && ` · Last regenerated ${new Date(pack.last_regenerated_at).toLocaleString()}`}
          {' · '}System v{pack.generated_by_system_version}
        </div>
      </div>

      {/* Missing apply URL banner */}
      {(opportunity?.is_manual_external_intake || opportunity?.source_family === 'manual_external') &&
       !opportunity?.application_url && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
          padding: '12px 16px', marginBottom: 14,
        }}>
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 6 }}>
            ⚠ Apply URL missing
          </div>
          <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10 }}>
            This role was added manually. No direct apply URL has been provided yet.
            Find the official ATS or company apply link and add it here.
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!addUrlValue.trim()) return;
              setAddingUrl(true);
              try {
                const res = await updateApplyUrl(id, addUrlValue.trim());
                setOppLocal(res.opportunity);
                await loadOpportunities();
                setAddUrlValue('');
                notify('Apply URL added — status updated.', 'success');
              } catch (err) {
                notify(err.message, 'error');
              } finally {
                setAddingUrl(false);
              }
            }}
            style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <input
              type="url"
              className="form-input"
              placeholder="https://boards.greenhouse.io/... or company.com/apply/..."
              value={addUrlValue}
              onChange={e => setAddUrlValue(e.target.value)}
              required
              style={{ flex: 1, minWidth: 240, fontSize: 13 }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={addingUrl}>
              {addingUrl ? 'Saving…' : 'Add Apply URL'}
            </button>
          </form>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(opportunity?.status === 'apply_pack_generated' || opportunity?.status === 'needs_apply_url') && (
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
        <button className="btn btn-ghost btn-sm" onClick={handlePrintExport}>📄 Export Text Pack</button>
        <button className="btn btn-ghost btn-sm" onClick={handleExport}>⬇ Export Pack JSON</button>
        {/* Pack readiness indicator */}
        {packReadiness !== undefined && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600,
            color: packReadiness >= 80 ? 'var(--green)' : packReadiness >= 50 ? 'var(--amber)' : 'var(--gray-500)',
            background: packReadiness >= 80 ? '#f0fdf4' : packReadiness >= 50 ? '#fffbeb' : 'var(--gray-50)',
            borderRadius: 4, padding: '2px 8px', border: '1px solid currentColor',
          }}>
            Pack Readiness: {packReadiness}%
          </span>
        )}
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

      {/* ── COPY-READY TAB ── */}
      {activeTab === 'copyready' && (
        <div>
          <div style={{
            background: '#eff6ff', border: '1px solid var(--blue)', borderRadius: 8,
            padding: 12, marginBottom: 14, fontSize: 12, color: '#1e40af', lineHeight: 1.6,
          }}>
            ✍ <strong>Copy-Ready Blocks</strong> — These are draft-ready assets aligned to this role and lane.
            Copy, review, and personalise before use. They are NOT finished statements —
            they are starting points that save you the blank-page problem.
          </div>

          {pack.copy_ready_summary_block && (
            <Section
              title="COPY-READY SUMMARY BLOCK"
              actionSlot={<CopyButton text={pack.copy_ready_summary_block} label="📋 Copy Summary" />}
            >
              <pre style={{
                fontSize: 13, color: 'var(--gray-800)', background: '#f0fdf4',
                borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.7,
                margin: 0, fontFamily: 'inherit', border: '1px solid var(--green)',
              }}>
                {pack.copy_ready_summary_block}
              </pre>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6, fontStyle: 'italic' }}>
                Replace [X], [bracketed], and [Company] placeholders with your real experience before using.
              </div>
            </Section>
          )}

          {pack.copy_ready_resume_emphasis_block && (
            <Section
              title="COPY-READY RESUME EMPHASIS BLOCK"
              actionSlot={<CopyButton text={pack.copy_ready_resume_emphasis_block} label="📋 Copy Emphasis" />}
            >
              <pre style={{
                fontSize: 13, color: 'var(--gray-800)', background: '#fffbeb',
                borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.7,
                margin: 0, fontFamily: 'inherit', border: '1px solid #fde68a',
              }}>
                {pack.copy_ready_resume_emphasis_block}
              </pre>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6, fontStyle: 'italic' }}>
                Use this as your editing checklist — these are themes and proof points to surface, not fabricated claims.
              </div>
            </Section>
          )}

          {/* Quick-access copies */}
          <Section title="QUICK COPY ACCESS">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pack.keyword_mirror_list?.length > 0 && (
                <CopyButton text={pack.keyword_mirror_list.join(', ')} label="📋 Copy Keywords" />
              )}
              {pack.recruiter_outreach_draft && (
                <CopyButton text={pack.recruiter_outreach_draft} label="📧 Copy Recruiter Outreach" />
              )}
              {pack.hiring_manager_outreach_draft && (
                <CopyButton text={pack.hiring_manager_outreach_draft} label="📧 Copy HM Outreach" />
              )}
              {pack.summary_direction && (
                <CopyButton text={pack.summary_direction} label="📋 Copy Summary Direction" />
              )}
            </div>
          </Section>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrintExport}>
              📄 Export Full Text Pack
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>
              ⬇ Export JSON Pack
            </button>
          </div>
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
              {/* Prepend missing apply URL item if relevant */}
              {(opportunity?.is_manual_external_intake || opportunity?.source_family === 'manual_external') &&
               !opportunity?.application_url && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                  background: '#fffbeb', border: '1px solid #fde68a',
                }}>
                  <span style={{ marginTop: 2, fontSize: 14 }}>⚠</span>
                  <span style={{ fontSize: 13, color: '#92400e', lineHeight: 1.5, fontWeight: 500 }}>
                    Find and add the official apply URL (ATS or company careers page) — required before applying
                  </span>
                </div>
              )}
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
