import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { batchUpdateApplyUrls } from '../lib/api.js';
import { classifyReadinessGroup, READINESS_GROUPS } from '../../netlify/functions/_shared/readiness.js';

/**
 * BatchUrlPanel — Add apply URLs to multiple "Needs Apply URL" opportunities
 * without opening each one individually.
 *
 * Preserves all auditability: calls updateApplyUrl() internally per record,
 * which triggers Apply Pack regeneration and history.
 */
export default function BatchUrlPanel({ onClose }) {
  const { state, loadOpportunities, notify } = useApp();
  const [urls, setUrls] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState([]);

  // Only show opportunities that need an apply URL
  const needsUrl = useMemo(() =>
    state.opportunities.filter(o =>
      classifyReadinessGroup(o) === READINESS_GROUPS.NEEDS_APPLY_URL
    ).sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)),
  [state.opportunities]);

  // Pre-fill inputs with existing canonical/posting URL if the opportunity has one
  useEffect(() => {
    setUrls(prev => {
      const next = { ...prev };
      needsUrl.forEach(opp => {
        const existing = opp.canonical_job_url || opp.application_url || '';
        if (!next[opp.id] && existing) {
          next[opp.id] = existing;
        }
      });
      return next;
    });
  }, [needsUrl]);

  const handleChange = (id, value) => {
    setUrls(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    const entries = Object.entries(urls)
      .filter(([, url]) => url && url.trim())
      .map(([id, applicationUrl]) => ({ id, applicationUrl }));

    if (entries.length === 0) {
      notify('No URLs entered.', 'info');
      return;
    }

    setSaving(true);
    try {
      const result = await batchUpdateApplyUrls(entries);
      await loadOpportunities();
      setSaved(entries.map(e => e.id));
      setUrls({});
      if (result.errors.length > 0) {
        notify(`Saved ${result.updated} URL${result.updated !== 1 ? 's' : ''}. ${result.errors.length} failed.`, 'warning');
      } else {
        notify(`${result.updated} apply URL${result.updated !== 1 ? 's' : ''} saved. Apply Packs updated.`, 'success');
      }
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filledCount = Object.values(urls).filter(v => v && v.trim()).length;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fde68a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: 18 }}>🔗</span>
          <div>
            <h2 style={{ color: '#c2410c', marginBottom: 0 }}>Batch Add Apply URLs</h2>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
              {needsUrl.length} approved role{needsUrl.length !== 1 ? 's' : ''} waiting for an apply URL.
              Paste URLs below to unlock full readiness.
            </div>
          </div>
        </div>
        {onClose && (
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20, lineHeight: 1 }}
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        )}
      </div>
      <div className="card-body">
        {needsUrl.length === 0 ? (
          <div className="text-muted text-sm">
            ✅ No roles are blocked on a missing apply URL right now.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {needsUrl.map(opp => (
                <div key={opp.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '10px 12px',
                  background: saved.includes(opp.id) ? '#f0fdf4' : '#fafafa',
                  borderRadius: 8,
                  border: `1px solid ${saved.includes(opp.id) ? '#86efac' : '#e5e7eb'}`,
                }}>
                  <div style={{ minWidth: 180, flex: '1 1 180px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{opp.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {opp.company}
                      {opp.fit_score ? ` · Fit: ${opp.fit_score}` : ''}
                    </div>
                  </div>
                  {saved.includes(opp.id) ? (
                    <span style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>
                  ) : (
                    <input
                      type="url"
                      className="form-input"
                      style={{ flex: '2 1 260px', minWidth: 200 }}
                      placeholder="https://company.com/careers/apply..."
                      value={urls[opp.id] || ''}
                      onChange={e => handleChange(opp.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                disabled={saving || filledCount === 0}
                onClick={handleSave}
              >
                {saving ? 'Saving…' : `Save ${filledCount > 0 ? filledCount : ''} URL${filledCount !== 1 ? 's' : ''}`}
              </button>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                Apply Packs will auto-refresh and readiness scores will update.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
