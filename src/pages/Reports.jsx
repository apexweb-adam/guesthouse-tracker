import React, { useState, useEffect, useCallback } from 'react';
import { fetchDigest, triggerExport } from '../lib/api.js';
import { useApp } from '../context/AppContext.jsx';

const DIGEST_TYPES = [
  { id: 'approval', label: 'Approval Queue', icon: '✅' },
  { id: 'stale', label: 'Stale / Ghosted', icon: '⚠️' },
  { id: 'weekly', label: 'Weekly Summary', icon: '📅' },
  { id: 'ingestion', label: 'Ingestion Health', icon: '📡' },
];

export default function Reports() {
  const { state, notify } = useApp();
  const [activeType, setActiveType] = useState('approval');
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadDigest = useCallback(async (type) => {
    setLoading(true);
    setDigest(null);
    try {
      const data = await fetchDigest(type);
      setDigest(data?.digest || null);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadDigest(activeType);
  }, [activeType, loadDigest]);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      await triggerExport(format);
      notify(`Export started (${format.toUpperCase()}).`, 'success');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="section-title">Reports &amp; Digests</h1>
      <p className="section-sub">Live summaries from your job search data. Generated on demand — no stale caches.</p>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {DIGEST_TYPES.map(t => (
          <button
            key={t.id}
            className={`btn ${activeType === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setActiveType(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => handleExport('json')} disabled={exporting}>
            ⬇ Export JSON
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleExport('csv')} disabled={exporting}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {loading && (
        <div className="card card-pad" style={{ color: 'var(--gray-500)', fontSize: 13 }}>Generating digest…</div>
      )}

      {!loading && digest && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary banner */}
          <div className="card card-pad" style={{ borderLeft: '3px solid var(--blue)', background: '#eff6ff' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{digest.summary}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
              Generated {new Date(digest.generatedAt).toLocaleString()}
              {state.demoMode && ' · Demo mode'}
            </div>
          </div>

          {/* Approval digest */}
          {digest.type === 'approval' && (
            <div className="card">
              <div className="card-header"><h2>Pending Approval</h2></div>
              <div className="card-body">
                <div className="grid-4" style={{ marginBottom: 16 }}>
                  {[
                    { label: 'Total pending', value: digest.totalPending, color: 'var(--amber)' },
                    { label: 'Recommended', value: digest.recommendedCount, color: 'var(--green)' },
                    { label: 'High fit', value: digest.highFitCount, color: 'var(--blue)' },
                  ].map((s, i) => (
                    <div key={i} className="card stat-card">
                      <div className="stat-card__value" style={{ color: s.color }}>{s.value}</div>
                      <div className="stat-card__label">{s.label}</div>
                    </div>
                  ))}
                </div>
                {(digest.topOpportunities || []).length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Top opportunities by score:</div>
                    {digest.topOpportunities.map(o => (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: 'var(--blue)', minWidth: 28 }}>{o.fitScore}</span>
                        <span style={{ flex: 1 }}>{o.title}</span>
                        <span style={{ color: 'var(--gray-500)' }}>{o.company}</span>
                        <span style={{ fontSize: 11, color: o.recommended ? 'var(--green)' : 'var(--gray-400)' }}>
                          {o.recommended ? '✓ Rec' : 'Low fit'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stale digest */}
          {digest.type === 'stale' && (
            <div className="card">
              <div className="card-header"><h2>Stale / Ghosted Opportunities</h2></div>
              <div className="card-body">
                <div className="grid-4" style={{ marginBottom: 16 }}>
                  {[
                    { label: 'Total stale', value: digest.totalStale, color: 'var(--amber)' },
                    { label: 'Ghosted', value: digest.ghostedCount, color: 'var(--red)' },
                    { label: 'Need follow-up', value: digest.staleCount, color: 'var(--amber)' },
                  ].map((s, i) => (
                    <div key={i} className="card stat-card">
                      <div className="stat-card__value" style={{ color: s.color }}>{s.value}</div>
                      <div className="stat-card__label">{s.label}</div>
                    </div>
                  ))}
                </div>
                {(digest.items || []).length > 0 ? (
                  digest.items.map(o => (
                    <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: o.isGhosted ? 'var(--red)' : 'var(--amber)' }}>
                          {o.isGhosted ? '👻 Ghosted' : '⚠ Stale'}
                        </span>
                        <span style={{ fontWeight: 500 }}>{o.title}</span>
                        <span style={{ color: 'var(--gray-500)' }}>{o.company}</span>
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 'auto' }}>{o.daysSinceAction}d ago</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 2 }}>{o.suggestedAction}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted text-sm">No stale opportunities — great job staying on top of follow-ups.</div>
                )}
              </div>
            </div>
          )}

          {/* Weekly digest */}
          {digest.type === 'weekly' && (
            <>
              <div className="card">
                <div className="card-header"><h2>Pipeline Funnel</h2></div>
                <div className="card-body">
                  <div className="grid-4">
                    {Object.entries(digest.funnel || {}).map(([key, val]) => (
                      <div key={key} className="card stat-card">
                        <div className="stat-card__value">{val}</div>
                        <div className="stat-card__label">{key.replace(/_/g, ' ')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-header"><h2>Ingestion This Week</h2></div>
                <div className="card-body">
                  <div className="grid-4">
                    {[
                      { label: 'Runs', value: digest.ingestion?.runsTotal },
                      { label: 'New jobs ingested', value: digest.ingestion?.newJobsIngested },
                      { label: 'Deduped', value: digest.ingestion?.dedupedTotal },
                      { label: 'Failures', value: digest.ingestion?.failures, color: digest.ingestion?.failures > 0 ? 'var(--red)' : undefined },
                    ].map((s, i) => (
                      <div key={i} className="card stat-card">
                        <div className="stat-card__value" style={s.color ? { color: s.color } : {}}>{s.value ?? 0}</div>
                        <div className="stat-card__label">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Ingestion digest */}
          {digest.type === 'ingestion' && (
            <div className="card">
              <div className="card-header"><h2>Source Ingestion Summary</h2></div>
              <div className="card-body">
                {(digest.sourceSummaries || []).length === 0 && (
                  <div className="text-muted text-sm">No ingestion runs recorded yet.</div>
                )}
                {(digest.sourceSummaries || []).map(s => (
                  <div key={s.sourceId} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 500, flex: 1 }}>{s.sourceId}</span>
                      <span style={{ color: 'var(--green)' }}>{s.totalNew} new</span>
                      <span style={{ color: 'var(--gray-500)' }}>{s.totalDeduped} deduped</span>
                      {s.failures > 0 && <span style={{ color: 'var(--red)' }}>{s.failures} failures</span>}
                      <span style={{ fontSize: 11, color: s.lastStatus === 'failure' ? 'var(--red)' : s.lastStatus === 'partial' ? 'var(--amber)' : 'var(--green)' }}>
                        {s.lastStatus}
                      </span>
                    </div>
                    {s.lastRun && (
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        Last run: {new Date(s.lastRun).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export / backup section */}
      <div className="card card-pad" style={{ marginTop: 24, fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
        <strong>Export / Backup:</strong> Use the JSON or CSV export buttons above to download all opportunity data.
        JSON includes full records with fit signals, audit trail, and source metadata.
        CSV is suitable for spreadsheet import.
        No backup is automatic — trigger manually as needed.
      </div>
    </div>
  );
}
