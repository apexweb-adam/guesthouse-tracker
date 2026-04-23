import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchDigest, triggerExport } from '../lib/api.js';
import { useApp } from '../context/AppContext.jsx';
import { computeReadinessSummary, classifyReadinessGroup, READINESS_GROUPS, READINESS_GROUP_LABELS } from '../../netlify/functions/_shared/readiness.js';
import { LANE_CONFIG } from '../../netlify/functions/_shared/scoring.js';
import {
  getActiveDirectTargetEmployers,
  getKnownIntermediaries,
  computeEmployerQualitySignals,
  getSourceQualityWarnings,
  SOURCE_WARNING_LABELS,
  EMPLOYER_PRIORITY,
  EMPLOYER_TYPE,
} from '../../netlify/functions/_shared/targetEmployers.js';
import {
  computeOutreachResponseRate,
  getFollowUpsDue,
  getAppliedUntouched,
  FOLLOW_UP_CADENCE,
} from '../../netlify/functions/_shared/outreach.js';

const DIGEST_TYPES = [
  { id: 'readiness',           label: 'Readiness Panel',    icon: '🎯' },
  { id: 'source_quality',      label: 'Source Quality',     icon: '📊' },
  { id: 'employer_targeting',  label: 'Employer Targets',   icon: '🏢' },
  { id: 'outreach',            label: 'Outreach & Follow-Up', icon: '📬' },
  { id: 'approval',            label: 'Approval Queue',     icon: '✅' },
  { id: 'stale',               label: 'Stale / Ghosted',    icon: '⚠️' },
  { id: 'weekly',              label: 'Weekly Summary',     icon: '📅' },
  { id: 'ingestion',           label: 'Ingestion Health',   icon: '📡' },
];

const SF_META = {
  greenhouse: { label: 'Greenhouse', color: '#15803d', bg: '#dcfce7' },
  lever:      { label: 'Lever',      color: '#7c3aed', bg: '#f5f3ff' },
  usajobs:    { label: 'USAJobs',    color: '#1d4ed8', bg: '#eff6ff' },
  seek:       { label: 'SEEK',       color: '#0369a1', bg: '#f0f9ff' },
  apsjobs:    { label: 'APSJobs',    color: '#b45309', bg: '#fef3c7' },
  manual:     { label: 'Manual',     color: '#6b7280', bg: '#f9fafb' },
  csv:        { label: 'CSV Upload', color: '#6b7280', bg: '#f9fafb' },
  demo:       { label: 'Demo',       color: '#9ca3af', bg: '#f3f4f6' },
};

// ─── Source Quality Panel (live, computed from opportunity state) ──────────────
// Shows per-source-family quality metrics so the operator can answer:
//   - Is Lever better than Greenhouse?
//   - Which source family is producing junk?
//   - Which source family should be throttled or disabled?

function SourceQualityPanel({ opps }) {
  const familyStats = useMemo(() => {
    const map = {};
    for (const o of opps) {
      const sf = o.source_family || 'manual';
      if (!map[sf]) {
        map[sf] = {
          source_family: sf,
          total: 0,
          recommended: 0,
          high_fit: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          score_sum: 0,
          missing_url: 0,
          lane_counts: {},
        };
      }
      const s = map[sf];
      s.total++;
      if (o.recommended) s.recommended++;
      if (o.high_fit || (o.fit_score || 0) >= 85) s.high_fit++;
      if (o.approval_state === 'approved') s.approved++;
      if (o.approval_state === 'rejected') s.rejected++;
      if (o.approval_state === 'pending') s.pending++;
      s.score_sum += (o.fit_score || 0);
      if (o.approval_state === 'approved' && !o.canonical_job_url && !o.application_url) s.missing_url++;
      if (o.lane) s.lane_counts[o.lane] = (s.lane_counts[o.lane] || 0) + 1;
    }
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .map(s => ({
        ...s,
        avg_score: s.total > 0 ? Math.round(s.score_sum / s.total) : 0,
        recommended_pct: s.total > 0 ? Math.round((s.recommended / s.total) * 100) : 0,
        junk_pct: s.total > 0 ? Math.round(((s.total - s.recommended) / s.total) * 100) : 0,
        top_lane: Object.entries(s.lane_counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      }));
  }, [opps]);

  if (familyStats.length === 0) {
    return (
      <div className="card card-pad" style={{ color: 'var(--gray-500)', fontSize: 13 }}>
        No opportunities loaded yet. Add roles manually or run a live discovery run first.
      </div>
    );
  }

  const isNoisy = (s) => s.total >= 5 && s.junk_pct > 50;
  const isNoiseAlert = (s) => s.total >= 5 && s.junk_pct > 60;

  // Pre-compute source quality warnings from targetEmployers module
  const sourceWarnings = useMemo(() => {
    const map = {};
    for (const sf of Object.keys(SF_META)) {
      map[sf] = getSourceQualityWarnings(sf, opps);
    }
    return map;
  }, [opps]);

  // Find the best-signal source (highest recommended_pct) among families with >= 3 records
  const eligibleForBadge = familyStats.filter(s => s.total >= 3);
  const bestSignalFamily = eligibleForBadge.length >= 2
    ? eligibleForBadge.reduce((best, s) => s.recommended_pct > best.recommended_pct ? s : best, eligibleForBadge[0])
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ fontSize: 12, color: 'var(--gray-600)', borderLeft: '3px solid var(--blue)', background: '#eff6ff' }}>
        <strong>Source Quality Report</strong> — computed from all ingested opportunities in this session.
        Use this to compare Greenhouse vs Lever quality and decide which source to throttle or promote.
        Dedup rates are available in the <strong>Ingestion Health</strong> tab.
      </div>

      {/* Summary row */}
      <div className="grid-4">
        {familyStats.slice(0, 4).map(s => {
          const meta = SF_META[s.source_family] || SF_META.manual;
          return (
            <div key={s.source_family} className="card stat-card" style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
              <div className="stat-card__value" style={{ color: meta.color, fontSize: 20 }}>{s.total}</div>
              <div className="stat-card__label">{meta.label}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-600)', marginTop: 2 }}>
                avg score: {s.avg_score} · {s.recommended_pct}% rec
                {isNoisy(s) && <span style={{ color: '#c2410c', fontWeight: 700 }}> · ⚠ noisy</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-family detail table */}
      <div className="card">
        <div className="card-header"><h2>Per-Source-Family Breakdown</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="source-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Total</th>
                <th>Recommended</th>
                <th>High Fit (85+)</th>
                <th>Avg Score</th>
                <th>Junk Rate</th>
                <th>Approved</th>
                <th>Rejected</th>
                <th>Pending</th>
                <th>Missing URL</th>
                <th>Top Lane</th>
                <th>Quality</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {familyStats.map(s => {
                const meta = SF_META[s.source_family] || SF_META.manual;
                const noisy = isNoisy(s);
                const noiseAlert = isNoiseAlert(s);
                const isBestSignal = bestSignalFamily && s.source_family === bestSignalFamily.source_family;
                const laneMeta = s.top_lane ? LANE_CONFIG[s.top_lane] : null;
                const sfWarnings = sourceWarnings[s.source_family] || [];
                return (
                  <tr key={s.source_family}>
                    <td>
                      <span style={{
                        background: meta.bg, color: meta.color,
                        padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      }}>
                        {meta.label}
                      </span>
                      {isBestSignal && (
                        <span style={{ marginLeft: 5, background: '#dcfce7', color: '#15803d', padding: '1px 5px', borderRadius: 8, fontSize: 9, fontWeight: 700 }}>
                          ✓ Better Signal
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.total}</td>
                    <td style={{ fontSize: 12, color: 'var(--green)' }}>{s.recommended} ({s.recommended_pct}%)</td>
                    <td style={{ fontSize: 12, color: '#1d4ed8' }}>{s.high_fit}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: s.avg_score >= 70 ? 'var(--green)' : s.avg_score >= 50 ? 'var(--amber)' : 'var(--gray-500)' }}>
                      {s.avg_score}
                    </td>
                    <td style={{ fontSize: 12, color: noiseAlert ? '#c2410c' : noisy ? 'var(--amber)' : 'inherit', fontWeight: noiseAlert ? 700 : 'normal' }}>
                      {s.junk_pct}%
                      {noiseAlert && <span style={{ marginLeft: 4, background: '#fee2e2', color: '#c2410c', padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 700 }}>Noise Alert</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.approved}</td>
                    <td style={{ fontSize: 12, color: s.rejected > 0 ? 'var(--red)' : 'inherit' }}>{s.rejected}</td>
                    <td style={{ fontSize: 12, color: 'var(--amber)' }}>{s.pending}</td>
                    <td style={{ fontSize: 12, color: s.missing_url > 0 ? 'var(--red)' : 'inherit' }}>{s.missing_url}</td>
                    <td style={{ fontSize: 11 }}>
                      {laneMeta ? (
                        <span style={{ background: `${laneMeta.color}18`, color: laneMeta.color, padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>
                          {laneMeta.short}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {noisy ? (
                        <span style={{ color: '#c2410c', fontWeight: 700 }}>⚠ Noisy (&gt;50% low-fit)</span>
                      ) : s.total >= 5 && s.recommended_pct >= 60 ? (
                        <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Strong</span>
                      ) : s.total < 3 ? (
                        <span style={{ color: 'var(--gray-400)' }}>Insufficient data</span>
                      ) : (
                        <span style={{ color: 'var(--amber)' }}>Mixed</span>
                      )}
                    </td>
                    <td style={{ fontSize: 10, maxWidth: 140 }}>
                      {sfWarnings.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {sfWarnings.map(w => (
                            <span key={w} style={{ color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '1px 4px', fontSize: 9, fontWeight: 600 }}>
                              {w.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--gray-400)' }}>
          ⚠ Noisy: &gt;50% of ingested records are low-fit (not recommended). Consider throttling or disabling this source.
          ✓ Strong: ≥60% recommended rate with ≥5 records.
        </div>
      </div>

      {/* Source comparison guidance */}
      {familyStats.length >= 2 && (() => {
        const live = familyStats.filter(s => ['greenhouse', 'lever', 'usajobs', 'seek', 'apsjobs'].includes(s.source_family));
        if (live.length < 2) return null;
        const best = [...live].sort((a, b) => b.recommended_pct - a.recommended_pct)[0];
        const worst = [...live].sort((a, b) => a.recommended_pct - b.recommended_pct)[0];
        if (best.source_family === worst.source_family) return null;
        const bestMeta = SF_META[best.source_family] || SF_META.manual;
        const worstMeta = SF_META[worst.source_family] || SF_META.manual;
        return (
          <div className="card card-pad" style={{ fontSize: 12, borderLeft: '3px solid var(--green)', background: '#f0fdf4' }}>
            <strong>Source Comparison:</strong>{' '}
            <span style={{ color: bestMeta.color }}>{bestMeta.label}</span> has the highest recommended rate ({best.recommended_pct}%)
            {best.total >= 5 ? '' : ' (limited data)'}.{' '}
            {worst.total >= 5 && worst.recommended_pct < 40 ? (
              <span>
                <span style={{ color: worstMeta.color }}>{worstMeta.label}</span> has low recommended rate ({worst.recommended_pct}%) —
                consider reducing {worstMeta.label} boards or tightening its config.
              </span>
            ) : (
              <span>Both sources are within acceptable quality range.</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Employer Target Panel ────────────────────────────────────────────────────
// Shows which target employers have yielded opportunities, source combinations,
// and which are producing the best TPM / IT PM results.
// Also shows known intermediaries for awareness.

function EmployerTargetPanel({ opps }) {
  const directTargets = getActiveDirectTargetEmployers();
  const intermediaries = getKnownIntermediaries();

  // Build per-employer stats from ingested opportunities
  const employerStats = useMemo(() => {
    return directTargets.map(emp => {
      const signals = computeEmployerQualitySignals(opps, emp.name);
      return { ...emp, signals };
    });
  }, [opps, directTargets]);

  // Split by priority
  const highPriority = employerStats.filter(e => e.priority === EMPLOYER_PRIORITY.HIGH);
  const mediumPriority = employerStats.filter(e => e.priority === EMPLOYER_PRIORITY.MEDIUM);

  // Intermediary warnings from ingested data
  const intermediaryStats = useMemo(() => {
    return intermediaries.map(emp => {
      const signals = computeEmployerQualitySignals(opps, emp.name);
      return { ...emp, signals };
    }).filter(e => e.signals !== null); // only show if we've seen roles from them
  }, [opps, intermediaries]);

  const totalTargetRoles = opps.filter(o => o.is_target_employer).length;
  const totalIntermediaryRoles = opps.filter(o => o.is_intermediary).length;

  function EmployerRow({ emp }) {
    const s = emp.signals;
    const priorityColor = emp.priority === EMPLOYER_PRIORITY.HIGH ? '#15803d' : emp.priority === EMPLOYER_PRIORITY.MEDIUM ? '#1d4ed8' : '#6b7280';
    const priorityBg = emp.priority === EMPLOYER_PRIORITY.HIGH ? '#dcfce7' : emp.priority === EMPLOYER_PRIORITY.MEDIUM ? '#eff6ff' : '#f9fafb';
    return (
      <tr>
        <td>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{emp.name}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{emp.notes}</div>
        </td>
        <td>
          <span style={{ background: priorityBg, color: priorityColor, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>
            {emp.priority}
          </span>
        </td>
        <td style={{ fontSize: 11 }}>
          {emp.domain_tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ display: 'inline-block', background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: 6, fontSize: 9, marginRight: 3, marginBottom: 2 }}>
              {tag}
            </span>
          ))}
        </td>
        <td style={{ fontSize: 11 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {emp.federal && <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600 }}>🏛 federal</span>}
            {emp.security && <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600 }}>🔒 security</span>}
            {emp.cloud && <span style={{ background: '#ecfdf5', color: '#059669', padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 600 }}>☁️ cloud</span>}
          </div>
        </td>
        <td style={{ fontSize: 12, fontWeight: 600, color: s ? '#1d4ed8' : 'var(--gray-400)' }}>
          {s ? s.total : '—'}
        </td>
        <td style={{ fontSize: 12, color: s ? (s.recommendedRate >= 60 ? '#15803d' : s.recommendedRate >= 40 ? 'var(--amber)' : 'var(--red)') : 'var(--gray-400)' }}>
          {s ? `${s.recommendedRate}%` : '—'}
        </td>
        <td style={{ fontSize: 12, color: s && s.highFitCount > 0 ? '#1d4ed8' : 'var(--gray-400)' }}>
          {s ? s.highFitCount : '—'}
        </td>
        <td style={{ fontSize: 12, color: s && s.responseReadyCount > 0 ? '#15803d' : 'var(--gray-400)' }}>
          {s ? s.responseReadyCount : '—'}
        </td>
        <td style={{ fontSize: 11 }}>
          {s ? (
            s.total === 0 ? <span style={{ color: 'var(--gray-400)' }}>Not yet seen</span>
            : s.recommendedRate >= 60 ? <span style={{ color: '#15803d', fontWeight: 700 }}>✓ Strong signal</span>
            : <span style={{ color: 'var(--amber)' }}>Mixed</span>
          ) : (
            <span style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>No roles ingested yet</span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ fontSize: 12, color: 'var(--gray-600)', borderLeft: '3px solid #1d4ed8', background: '#eff6ff' }}>
        <strong>Employer Targeting Panel</strong> — shows which target employers are active in your pipeline
        and how many TPM/IT PM roles they've produced. Use this to decide which Lever/Greenhouse boards to
        add next. Intermediary warnings flag staffing firms that may mask end employers.
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="card stat-card" style={{ background: '#dcfce7', border: '1px solid #15803d33', minWidth: 140 }}>
          <div className="stat-card__value" style={{ color: '#15803d', fontSize: 22 }}>{directTargets.filter(e => e.priority === EMPLOYER_PRIORITY.HIGH).length}</div>
          <div className="stat-card__label">High-priority targets</div>
        </div>
        <div className="card stat-card" style={{ background: '#eff6ff', border: '1px solid #1d4ed833', minWidth: 140 }}>
          <div className="stat-card__value" style={{ color: '#1d4ed8', fontSize: 22 }}>{totalTargetRoles}</div>
          <div className="stat-card__label">Roles from target employers</div>
        </div>
        <div className="card stat-card" style={{ background: '#fef3c7', border: '1px solid #92400e33', minWidth: 140 }}>
          <div className="stat-card__value" style={{ color: '#92400e', fontSize: 22 }}>{totalIntermediaryRoles}</div>
          <div className="stat-card__label">Roles from intermediaries</div>
        </div>
      </div>

      {/* High-priority target employers */}
      <div className="card">
        <div className="card-header" style={{ background: '#f0fdf4' }}>
          <h2 style={{ color: '#15803d' }}>🎯 High-Priority Target Employers</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="source-table">
            <thead>
              <tr>
                <th>Employer</th>
                <th>Priority</th>
                <th>Domain tags</th>
                <th>Signals</th>
                <th>Roles seen</th>
                <th>Rec rate</th>
                <th>High fit</th>
                <th>Response-ready</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {highPriority.map(emp => <EmployerRow key={emp.id} emp={emp} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Medium-priority target employers */}
      <div className="card">
        <div className="card-header">
          <h2>📌 Medium-Priority Target Employers</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="source-table">
            <thead>
              <tr>
                <th>Employer</th>
                <th>Priority</th>
                <th>Domain tags</th>
                <th>Signals</th>
                <th>Roles seen</th>
                <th>Rec rate</th>
                <th>High fit</th>
                <th>Response-ready</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {mediumPriority.map(emp => <EmployerRow key={emp.id} emp={emp} />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Intermediary warning section */}
      {intermediaryStats.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: '#fef3c7' }}>
            <h2 style={{ color: '#92400e' }}>⚙ Known Intermediaries / Staffing Firms ({intermediaryStats.length} seen)</h2>
          </div>
          <div className="card-body" style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 10 }}>
            These companies are staffing firms that may post roles without naming the end employer.
            Review end-client details before applying. Roles from these sources are flagged in the approval queue.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="source-table">
              <thead>
                <tr>
                  <th>Firm</th>
                  <th>Roles seen</th>
                  <th>Rec rate</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {intermediaryStats.map(emp => (
                  <tr key={emp.id}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{emp.name}</td>
                    <td style={{ fontSize: 12 }}>{emp.signals?.total ?? 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--amber)' }}>{emp.signals ? `${emp.signals.recommendedRate}%` : '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{emp.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card card-pad" style={{ fontSize: 12, color: 'var(--gray-500)', borderLeft: '3px solid var(--gray-300)' }}>
        <strong>How to use this panel:</strong> High-priority employers with zero roles seen → add their
        Lever/Greenhouse board slugs to your env vars. Employers with strong rec rate ≥ 60% → prioritise
        reviewing their approval queue. Intermediary-heavy sources → request end-client name before applying.
      </div>
    </div>
  );
}

// ─── Outreach & Follow-Up Panel (live, computed from opportunity state) ────────
// Operator can answer:
//   - Which applied roles need follow-up today?
//   - Which roles have no outreach sent?
//   - What is the response rate with outreach vs without?

function OutreachPanel({ opps }) {
  const responseRate = useMemo(() => computeOutreachResponseRate(opps), [opps]);
  const followUpsDue = useMemo(() => getFollowUpsDue(opps), [opps]);
  const untouched = useMemo(() => getAppliedUntouched(opps), [opps]);

  const appliedStatuses = ['applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer', 'rejected', 'ghosted'];
  const allApplied = useMemo(() =>
    opps.filter(o => appliedStatuses.includes(o.status))
      .sort((a, b) => new Date(b.last_action_date || 0) - new Date(a.last_action_date || 0)),
  [opps]);

  const overdueDue = followUpsDue.filter(o => o.next_action_due && new Date(o.next_action_due) < new Date());

  if (allApplied.length === 0 && followUpsDue.length === 0) {
    return (
      <div className="card card-pad" style={{ color: 'var(--gray-500)', fontSize: 13 }}>
        No applied roles yet. Once you start applying, outreach stats and follow-up cadence will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ fontSize: 12, color: 'var(--gray-600)', borderLeft: '3px solid #0369a1', background: '#f0f9ff' }}>
        <strong>Outreach & Follow-Up Report</strong> — live from your pipeline data.
        Use this to see which applied roles are untouched, which follow-ups are overdue, and whether outreach improves response rates.
        All outreach is sent manually — this panel tracks status and surfaces drafts to act on.
      </div>

      {/* Response Rate Summary */}
      <div className="grid-4">
        {[
          {
            label: 'Total Applied',
            value: responseRate.totalApplied,
            color: 'var(--gray-700)',
            bg: '#f9fafb',
          },
          {
            label: 'With Outreach',
            value: responseRate.withOutreach.count,
            sub: responseRate.withOutreach.responseRate !== null ? `${responseRate.withOutreach.responseRate}% response rate` : 'No data yet',
            color: '#0369a1',
            bg: '#f0f9ff',
          },
          {
            label: 'Without Outreach',
            value: responseRate.withoutOutreach.count,
            sub: responseRate.withoutOutreach.responseRate !== null ? `${responseRate.withoutOutreach.responseRate}% response rate` : 'No data yet',
            color: '#92400e',
            bg: '#fef3c7',
          },
          {
            label: 'Follow-Ups Due',
            value: followUpsDue.length,
            sub: overdueDue.length > 0 ? `${overdueDue.length} overdue` : 'On schedule',
            color: overdueDue.length > 0 ? '#c2410c' : '#15803d',
            bg: overdueDue.length > 0 ? '#fff1f2' : '#f0fdf4',
          },
        ].map((s, i) => (
          <div key={i} className="card stat-card" style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="stat-card__value" style={{ color: s.color, fontSize: 22 }}>{s.value}</div>
            <div className="stat-card__label">{s.label}</div>
            {s.sub && <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Response rate insight */}
      {responseRate.withOutreach.responseRate !== null && responseRate.withoutOutreach.responseRate !== null && (
        <div className="card card-pad" style={{
          borderLeft: '3px solid #0369a1', background: '#f0f9ff', fontSize: 12, color: '#0369a1',
        }}>
          {responseRate.withOutreach.responseRate > responseRate.withoutOutreach.responseRate
            ? `✓ Outreach is working: ${responseRate.withOutreach.responseRate}% response rate with outreach vs ${responseRate.withoutOutreach.responseRate}% without`
            : responseRate.withOutreach.responseRate === responseRate.withoutOutreach.responseRate
              ? `Response rates are equal with and without outreach (${responseRate.withOutreach.responseRate}%) — need more data`
              : `Outreach may not be differentiated yet (${responseRate.withOutreach.responseRate}% with vs ${responseRate.withoutOutreach.responseRate}% without) — check draft quality`
          }
        </div>
      )}

      {/* Follow-ups due */}
      {followUpsDue.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: overdueDue.length > 0 ? '#fff1f2' : '#fef3c7' }}>
            <h2 style={{ color: overdueDue.length > 0 ? '#c2410c' : '#92400e' }}>
              {overdueDue.length > 0 ? `🔴 Follow-Ups Overdue (${overdueDue.length})` : `📅 Follow-Ups Due (${followUpsDue.length})`}
            </h2>
          </div>
          <div className="card-body">
            {followUpsDue.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Status: {o.status}</span>
                {o.next_action_due && (
                  <span style={{
                    background: new Date(o.next_action_due) < new Date() ? '#fee2e2' : '#fef3c7',
                    color: new Date(o.next_action_due) < new Date() ? '#c2410c' : '#92400e',
                    padding: '2px 8px', borderRadius: 10, fontSize: 11,
                  }}>
                    {new Date(o.next_action_due) < new Date() ? '⚠ Overdue' : `Due ${o.next_action_due}`}
                  </span>
                )}
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              → Open the Apply Pack → Outreach tab to copy the appropriate follow-up draft
            </div>
          </div>
        </div>
      )}

      {/* Applied but no outreach */}
      {untouched.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: '#f3f4f6' }}>
            <h2 style={{ color: '#6b7280' }}>○ Applied — No Outreach Sent ({untouched.length})</h2>
          </div>
          <div className="card-body">
            {untouched.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--gray-400)', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10 }}>
                  No outreach
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              → Open each Apply Pack → Outreach tab to copy and send recruiter or hiring manager outreach
            </div>
          </div>
        </div>
      )}

      {/* Full applied pipeline */}
      {allApplied.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>📋 Applied Pipeline — Outreach Status</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="source-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Outreach Sent</th>
                  <th>FU-1 Sent</th>
                  <th>FU-2 Sent</th>
                  <th>Response</th>
                  <th>Screening</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {allApplied.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontSize: 12, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-600)' }}>{o.company}</td>
                    <td style={{ fontSize: 11 }}>
                      <span style={{ background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 6 }}>{o.status}</span>
                    </td>
                    <td style={{ fontSize: 11, color: o.outreach_sent ? '#15803d' : 'var(--gray-400)' }}>
                      {o.outreach_sent ? '✓ Yes' : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: o.follow_up_1_sent ? '#15803d' : 'var(--gray-400)' }}>
                      {o.follow_up_1_sent ? '✓ Yes' : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: o.follow_up_2_sent ? '#15803d' : 'var(--gray-400)' }}>
                      {o.follow_up_2_sent ? '✓ Yes' : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: o.recruiter_response ? '#1d4ed8' : 'var(--gray-400)' }}>
                      {o.recruiter_response ? '✉ Yes' : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: o.screening_call ? '#15803d' : 'var(--gray-400)' }}>
                      {o.screening_call ? '📞 Yes' : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--gray-600)' }}>{o.interview_stage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--gray-400)', borderTop: '1px solid var(--gray-100)' }}>
            Update outreach fields in the Apply Pack → Outreach tab as you take action. All updates are manual.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Readiness Panel (live, from local opportunity state) ─────────────────────

function ReadinessPanel({ opps }) {
  const summary = useMemo(() => computeReadinessSummary(opps), [opps]);

  const readyToApply = useMemo(() =>
    opps.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.READY_TO_APPLY)
      .sort((a, b) => (b.pack_readiness_score || 0) - (a.pack_readiness_score || 0)),
  [opps]);

  const blockedByUrl = useMemo(() =>
    opps.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.NEEDS_APPLY_URL),
  [opps]);

  const followUpDue = useMemo(() =>
    opps.filter(o => classifyReadinessGroup(o) === READINESS_GROUPS.APPLIED_FOLLOW_UP)
      .sort((a, b) => new Date(a.next_action_due || 0) - new Date(b.next_action_due || 0)),
  [opps]);

  const highFitPending = useMemo(() =>
    opps.filter(o => o.approval_state === 'pending' && (o.fit_score || 0) >= 70 && o.recommended),
  [opps]);

  const stats = [
    { label: 'Ready to Apply', value: summary.readyToApplyCount, color: '#15803d', bg: '#dcfce7', icon: '🟢' },
    { label: 'High Readiness (85%+)', value: summary.highReadinessCount, color: '#1d4ed8', bg: '#eff6ff', icon: '⭐' },
    { label: 'Blocked (no URL)', value: summary.blockedByMissingUrlCount, color: '#c2410c', bg: '#fff7ed', icon: '🔗' },
    { label: 'Follow-up Due', value: summary.appliedFollowUpDueCount, color: '#92400e', bg: '#fef3c7', icon: '📅' },
    { label: 'High-Fit Pending Approval', value: highFitPending.length, color: '#7c3aed', bg: '#f5f3ff', icon: '✅' },
    { label: 'In Progress', value: summary.inProgressCount, color: '#0369a1', bg: '#f0f9ff', icon: '🔄' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <div className="grid-4">
        {stats.map((s, i) => (
          <div key={i} className="card stat-card" style={{ background: s.bg, border: `1px solid ${s.color}22` }}>
            <div className="stat-card__value" style={{ color: s.color, fontSize: 22 }}>{s.icon} {s.value}</div>
            <div className="stat-card__label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ready to Apply */}
      <div className="card">
        <div className="card-header" style={{ background: '#f0fdf4' }}>
          <h2 style={{ color: '#15803d' }}>🟢 Ready to Apply Now</h2>
        </div>
        <div className="card-body">
          {readyToApply.length === 0 ? (
            <div className="text-muted text-sm">No roles fully ready yet — check blocked states below.</div>
          ) : (
            readyToApply.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {o.pack_readiness_score || 0}% ready
                </span>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
                  Fit: {o.fit_score || 0}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Blocked by URL */}
      {blockedByUrl.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: '#fff7ed' }}>
            <h2 style={{ color: '#c2410c' }}>🔗 Blocked — Needs Apply URL ({blockedByUrl.length})</h2>
          </div>
          <div className="card-body">
            {blockedByUrl.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                <span style={{ background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>
                  Approved, needs URL
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              → Go to Tracker → Filter "Needs Apply URL" to batch-add URLs
            </div>
          </div>
        </div>
      )}

      {/* Follow-up due */}
      {followUpDue.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: '#fef3c7' }}>
            <h2 style={{ color: '#92400e' }}>📅 Applied — Follow-up Due ({followUpDue.length})</h2>
          </div>
          <div className="card-body">
            {followUpDue.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                {o.next_action_due && (
                  <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 }}>
                    Due: {new Date(o.next_action_due).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-fit pending approval */}
      {highFitPending.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ background: '#f5f3ff' }}>
            <h2 style={{ color: '#7c3aed' }}>⭐ High-Fit Pending Approval ({highFitPending.length})</h2>
          </div>
          <div className="card-body">
            {highFitPending.map(o => (
              <div key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{o.title}</span>
                  <span style={{ color: 'var(--gray-500)', marginLeft: 8 }}>{o.company}</span>
                </div>
                <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  Fit: {o.fit_score}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              → Go to Approval Queue to review and approve these roles
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { state, notify } = useApp();
  const [activeType, setActiveType] = useState('readiness');
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadDigest = useCallback(async (type) => {
    if (type === 'readiness' || type === 'source_quality' || type === 'employer_targeting' || type === 'outreach') return; // These panels use live state
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

      {/* Readiness Panel — live, no API call needed */}
      {activeType === 'readiness' && (
        <ReadinessPanel opps={state.opportunities} />
      )}

      {/* Source Quality Panel — live, computed from opportunity state */}
      {activeType === 'source_quality' && (
        <SourceQualityPanel opps={state.opportunities} />
      )}

      {/* Employer Targeting Panel — live, computed from opportunity state + registry */}
      {activeType === 'employer_targeting' && (
        <EmployerTargetPanel opps={state.opportunities} />
      )}

      {/* Outreach & Follow-Up Panel — live, computed from opportunity state */}
      {activeType === 'outreach' && (
        <OutreachPanel opps={state.opportunities} />
      )}

      {activeType !== 'readiness' && activeType !== 'source_quality' && activeType !== 'employer_targeting' && activeType !== 'outreach' && loading && (
        <div className="card card-pad" style={{ color: 'var(--gray-500)', fontSize: 13 }}>Generating digest…</div>
      )}

      {activeType !== 'readiness' && activeType !== 'source_quality' && activeType !== 'employer_targeting' && activeType !== 'outreach' && !loading && digest && (
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
              {/* Readiness summary inline in weekly */}
              {digest.readiness && (
                <div className="card">
                  <div className="card-header"><h2>🎯 Readiness This Week</h2></div>
                  <div className="card-body">
                    <div className="grid-4">
                      {[
                        { label: 'Ready to Apply', value: digest.readiness.readyToApplyCount, color: 'var(--green)' },
                        { label: 'High Readiness (85%+)', value: digest.readiness.highReadinessCount, color: 'var(--blue)' },
                        { label: 'Blocked (no URL)', value: digest.readiness.blockedByMissingUrlCount, color: 'var(--amber)' },
                        { label: 'Follow-up Due', value: digest.readiness.appliedFollowUpDueCount, color: 'var(--red)' },
                      ].map((s, i) => (
                        <div key={i} className="card stat-card">
                          <div className="stat-card__value" style={{ color: s.color }}>{s.value}</div>
                          <div className="stat-card__label">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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

