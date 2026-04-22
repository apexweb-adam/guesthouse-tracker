import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchResumeVault,
  updateResumeVaultRecord,
  resetResumeVault,
} from '../lib/api.js';
import {
  VAULT_STATUS,
  VAULT_STATUS_LABELS,
  VAULT_LANE_LABELS,
  INITIAL_VAULT,
} from '../../netlify/functions/_shared/resumeVault.js';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  [VAULT_STATUS.ACTIVE]:   { bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
  [VAULT_STATUS.FALLBACK]: { bg: '#fef3c7', color: '#92400e', dot: '#d97706' },
  [VAULT_STATUS.ARCHIVED]: { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS[VAULT_STATUS.ARCHIVED];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
      {VAULT_STATUS_LABELS[status] || status}
    </span>
  );
}

// ─── Resume card ──────────────────────────────────────────────────────────────

function ResumeCard({ resume, onEdit, onStatusChange }) {
  const isArchived = resume.status === VAULT_STATUS.ARCHIVED;
  return (
    <div style={{
      border: '1px solid var(--gray-200, #e5e7eb)',
      borderRadius: 10,
      padding: '14px 16px',
      background: isArchived ? '#fafafa' : '#fff',
      opacity: isArchived ? 0.7 : 1,
      transition: 'box-shadow 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>
            {resume.display_name}
            {resume.is_canonical && (
              <span style={{
                marginLeft: 7, fontSize: 10, fontWeight: 700,
                background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '1px 7px',
              }}>
                canonical
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {VAULT_LANE_LABELS[resume.lane] || resume.lane}
            {resume.version_label && (
              <span style={{ marginLeft: 8, color: '#9ca3af' }}>· {resume.version_label}</span>
            )}
          </div>
        </div>
        <StatusBadge status={resume.status} />
        {/* Quality score */}
        <span style={{
          minWidth: 42, textAlign: 'center',
          padding: '2px 8px', borderRadius: 8,
          fontSize: 12, fontWeight: 700,
          background: resume.quality_score >= 85 ? '#dcfce7' : resume.quality_score >= 70 ? '#fef3c7' : '#f3f4f6',
          color: resume.quality_score >= 85 ? '#15803d' : resume.quality_score >= 70 ? '#92400e' : '#6b7280',
        }}>
          {resume.quality_score}
        </span>
      </div>

      {/* File name */}
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontFamily: 'monospace' }}>
        📄 {resume.original_file_name}
      </div>

      {/* Domain tags */}
      {resume.domain_tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {resume.domain_tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 10,
              background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Notes */}
      {resume.notes && (
        <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 10, lineHeight: 1.5 }}>
          {resume.notes}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(resume)}>
          ✏️ Edit
        </button>
        {resume.status !== VAULT_STATUS.ACTIVE && (
          <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: 'none' }}
            onClick={() => onStatusChange(resume.id, VAULT_STATUS.ACTIVE)}>
            ✓ Set Active
          </button>
        )}
        {resume.status !== VAULT_STATUS.FALLBACK && resume.status !== VAULT_STATUS.ARCHIVED && (
          <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: 'none' }}
            onClick={() => onStatusChange(resume.id, VAULT_STATUS.FALLBACK)}>
            ↩ Set Fallback
          </button>
        )}
        {resume.status !== VAULT_STATUS.ARCHIVED && (
          <button className="btn btn-sm" style={{ background: '#f3f4f6', color: '#6b7280', border: 'none' }}
            onClick={() => onStatusChange(resume.id, VAULT_STATUS.ARCHIVED)}>
            🗄 Archive
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ resume, onSave, onCancel }) {
  const [form, setForm] = useState({
    display_name: resume.display_name,
    notes: resume.notes || '',
    version_label: resume.version_label || '',
    quality_score: resume.quality_score || 50,
    status: resume.status,
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ marginBottom: 18, fontSize: 16, fontWeight: 700 }}>Edit Resume</h3>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Display Name</div>
          <input
            className="form-input"
            value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Version Label</div>
          <input
            className="form-input"
            value={form.version_label}
            onChange={e => setForm(f => ({ ...f, version_label: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Quality Score (0–100)</div>
          <input
            type="number" min={0} max={100}
            className="form-input"
            value={form.quality_score}
            onChange={e => setForm(f => ({ ...f, quality_score: Number(e.target.value) }))}
            style={{ width: 100 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Status</div>
          <select
            className="form-input"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          >
            {Object.entries(VAULT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes</div>
          <textarea
            className="form-input"
            rows={3}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </label>

        {form.status === VAULT_STATUS.ARCHIVED && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#dc2626',
          }}>
            ⚠️ Archived resumes cannot be selected for new applications.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics mini panel ─────────────────────────────────────────────────────

function VaultSummaryBar({ vault }) {
  const active = vault.filter(r => r.status === VAULT_STATUS.ACTIVE).length;
  const fallback = vault.filter(r => r.status === VAULT_STATUS.FALLBACK).length;
  const archived = vault.filter(r => r.status === VAULT_STATUS.ARCHIVED).length;
  const canonical = vault.filter(r => r.is_canonical && r.status === VAULT_STATUS.ACTIVE).length;

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      {[
        { label: 'Active', value: active, color: '#15803d', bg: '#dcfce7' },
        { label: 'Fallback', value: fallback, color: '#92400e', bg: '#fef3c7' },
        { label: 'Archived', value: archived, color: '#6b7280', bg: '#f3f4f6' },
        { label: 'Canonical', value: canonical, color: '#1d4ed8', bg: '#eff6ff' },
        { label: 'Total', value: vault.length, color: '#374151', bg: '#f9fafb' },
      ].map(({ label, value, color, bg }) => (
        <div key={label} style={{
          background: bg, color, borderRadius: 8, padding: '8px 14px',
          fontWeight: 700, fontSize: 14, minWidth: 80, textAlign: 'center',
        }}>
          <div style={{ fontSize: 22 }}>{value}</div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResumeVault() {
  const [vault, setVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchResumeVault()
      .then(v => setVault(v))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => (vault || []).filter(r => r.status === VAULT_STATUS.ACTIVE), [vault]);
  const fallback = useMemo(() => (vault || []).filter(r => r.status === VAULT_STATUS.FALLBACK), [vault]);
  const archived = useMemo(() => (vault || []).filter(r => r.status === VAULT_STATUS.ARCHIVED), [vault]);

  async function handleStatusChange(id, newStatus) {
    setSaving(true);
    try {
      const result = await updateResumeVaultRecord(id, { status: newStatus });
      setVault(result.vault);
      setSuccessMsg(`Status updated to ${VAULT_STATUS_LABELS[newStatus]}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(updates) {
    if (!editTarget) return;
    setSaving(true);
    try {
      const result = await updateResumeVaultRecord(editTarget.id, updates);
      setVault(result.vault);
      setEditTarget(null);
      setSuccessMsg('Resume updated.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const result = await resetResumeVault();
      setVault(result.vault);
      setConfirmReset(false);
      setSuccessMsg('Vault reset to defaults.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="card"><div className="card-body" style={{ color: '#6b7280' }}>Loading Resume Vault…</div></div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="page-content">
        <div className="card"><div className="card-body" style={{ color: '#dc2626' }}>Error: {error || 'Could not load vault.'}</div></div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
            📁 Resume Vault
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
            Manage your resume versions. Active resumes are recommended for new applications.
            Archived resumes are excluded from selection.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setConfirmReset(true)}
          disabled={saving}
        >
          ↺ Reset to Defaults
        </button>
      </div>

      {/* Success message */}
      {successMsg && (
        <div style={{
          background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8,
          padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#15803d',
        }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626',
        }}>
          ⚠️ {error}
          <button style={{ marginLeft: 12, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Summary bar */}
      <VaultSummaryBar vault={vault} />

      {/* Rules explanation */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
        padding: '10px 16px', marginBottom: 22, fontSize: 12, color: '#1e40af',
      }}>
        <strong>How it works:</strong> <strong>Active</strong> resumes are recommended by default.{' '}
        <strong>Fallback</strong> resumes are used only when the role lane specifically justifies it.{' '}
        <strong>Archived</strong> resumes cannot be selected for new applications.
        The system recommends based on role lane, fit score, and domain overlap.
      </div>

      {/* Active resumes */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#15803d', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
          Active Resumes ({active.length})
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>— recommended for new applications</span>
        </h2>
        {active.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>No active resumes. Activate at least one resume.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {active.map(r => (
              <ResumeCard
                key={r.id}
                resume={r}
                onEdit={setEditTarget}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </section>

      {/* Fallback resumes */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
          Fallback Resumes ({fallback.length})
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>— require role-lane justification</span>
        </h2>
        {fallback.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>No fallback resumes.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {fallback.map(r => (
              <ResumeCard
                key={r.id}
                resume={r}
                onEdit={setEditTarget}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </section>

      {/* Archived resumes — collapsed by default */}
      <section style={{ marginBottom: 16 }}>
        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 15, fontWeight: 700, color: '#6b7280',
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          }}
          onClick={() => setShowArchived(s => !s)}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#9ca3af', display: 'inline-block' }} />
          {showArchived ? '▾' : '▸'} Archived Resumes ({archived.length})
          <span style={{ fontSize: 11, fontWeight: 400 }}>— not selectable for new applications</span>
        </button>
        {showArchived && (
          <div style={{ display: 'grid', gap: 12 }}>
            {archived.map(r => (
              <ResumeCard
                key={r.id}
                resume={r}
                onEdit={setEditTarget}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </section>

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          resume={editTarget}
          onSave={handleSaveEdit}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {/* Reset confirm */}
      {confirmReset && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 400, width: '100%' }}>
            <h3 style={{ marginBottom: 10, fontSize: 16 }}>Reset Resume Vault?</h3>
            <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 20 }}>
              This will restore all 9 resumes to their factory defaults. Any custom edits to status,
              notes, or version labels will be lost.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: '#dc2626' }}
                onClick={handleReset}
                disabled={saving}
              >
                {saving ? 'Resetting…' : 'Yes, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
