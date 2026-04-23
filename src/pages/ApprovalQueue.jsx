import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useNavigate } from 'react-router-dom';
import OpportunityCard from '../components/OpportunityCard.jsx';
import { approveOpportunity, updateOpportunity } from '../lib/api.js';
import { classifyReadinessGroup, getReadinessReason, READINESS_GROUPS } from '../../netlify/functions/_shared/readiness.js';
import { LANE_CONFIG, LANES } from '../../netlify/functions/_shared/scoring.js';
import {
  buildApprovalQueueSignals,
  buildWeaknessReasons,
  isTargetEmployer,
  classifyEmployerType,
  EMPLOYER_TYPE,
} from '../../netlify/functions/_shared/targetEmployers.js';

// ─── Readiness indicator chip shown per pending opportunity ───────────────────

function ReadinessBadge({ opp }) {
  const group = classifyReadinessGroup(opp);
  const reason = getReadinessReason(opp);
  const score = opp.pack_readiness_score;

  const styles = {
    [READINESS_GROUPS.NEEDS_APPROVAL]: { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8', icon: '📋' },
    [READINESS_GROUPS.NEEDS_APPLY_URL]: { bg: '#fff7ed', border: '#fdba74', color: '#c2410c', icon: '🔗' },
    [READINESS_GROUPS.LOW_PRIORITY]: { bg: '#f9fafb', border: '#d1d5db', color: '#6b7280', icon: '⬇' },
  };
  const s = styles[group] || styles[READINESS_GROUPS.NEEDS_APPROVAL];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6,
      padding: '6px 10px', marginTop: 10, fontSize: 12,
    }}>
      <span>{s.icon}</span>
      <span style={{ color: s.color, fontWeight: 600 }}>{reason}</span>
      {typeof score === 'number' && (
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontWeight: 500 }}>
          Readiness: {score}%
        </span>
      )}
    </div>
  );
}

// ─── Priority label for fit score ─────────────────────────────────────────────

function FitPriorityChip({ opp }) {
  const score = opp.fit_score || 0;
  const isHighFit = score >= 70;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
      background: isHighFit ? '#dcfce7' : '#f3f4f6',
      color: isHighFit ? '#15803d' : '#6b7280',
      marginLeft: 8,
    }}>
      {isHighFit ? '⭐ High Fit' : `Fit: ${score}`}
    </span>
  );
}

// ─── Signal badge strip ────────────────────────────────────────────────────────

function SignalBadges({ opp }) {
  const signals = buildApprovalQueueSignals(opp);
  if (signals.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {signals.map(sig => (
        <span
          key={sig.type}
          style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
            background: sig.bg, color: sig.color,
          }}
        >
          {sig.label}
        </span>
      ))}
    </div>
  );
}

// ─── Decision support: why is this role weak ──────────────────────────────────

function WeaknessPanel({ opp }) {
  const reasons = buildWeaknessReasons(opp);
  if (reasons.length === 0) return null;
  return (
    <div style={{
      marginTop: 8, background: '#fafafa', border: '1px solid #e5e7eb',
      borderRadius: 6, padding: '8px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Why this role may be weak
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {reasons.map(r => (
          <li key={r.code} style={{ fontSize: 12, color: '#374151' }}>
            <strong style={{ color: '#b45309' }}>{r.label}:</strong> {r.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Unique source families from a list of opportunities ─────────────────────

function getSourceFamilies(opps) {
  const seen = new Set();
  opps.forEach(o => seen.add(o.source_family || 'manual'));
  return [...seen].sort();
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({
  opps,
  filterLane, setFilterLane,
  filterSource, setFilterSource,
  filterTargetOnly, setFilterTargetOnly,
  filterDirectOnly, setFilterDirectOnly,
  filterRecommendedOnly, setFilterRecommendedOnly,
  filterHighFitOnly, setFilterHighFitOnly,
  filterReviewed, setFilterReviewed,
  activeCount,
}) {
  const laneOptions = useMemo(() => {
    const seen = new Set();
    opps.forEach(o => o.lane && seen.add(o.lane));
    return [...seen].sort();
  }, [opps]);

  const sourceFamilies = useMemo(() => getSourceFamilies(opps), [opps]);

  const hasActiveFilters =
    filterLane !== 'all' || filterSource !== 'all' ||
    filterTargetOnly || filterDirectOnly ||
    filterRecommendedOnly || filterHighFitOnly ||
    filterReviewed !== 'all';

  const clearAll = () => {
    setFilterLane('all');
    setFilterSource('all');
    setFilterTargetOnly(false);
    setFilterDirectOnly(false);
    setFilterRecommendedOnly(false);
    setFilterHighFitOnly(false);
    setFilterReviewed('all');
  };

  return (
    <div style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', minWidth: 50 }}>
          Filters {hasActiveFilters && <span style={{ color: '#3b82f6' }}>({activeCount})</span>}
        </span>

        {/* Lane filter */}
        <select
          value={filterLane}
          onChange={e => setFilterLane(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: filterLane !== 'all' ? '#eff6ff' : '#fff' }}
        >
          <option value="all">All lanes</option>
          {laneOptions.map(l => (
            <option key={l} value={l}>{LANE_CONFIG[l]?.short || l}</option>
          ))}
        </select>

        {/* Source family filter */}
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: filterSource !== 'all' ? '#eff6ff' : '#fff' }}
        >
          <option value="all">All sources</option>
          {sourceFamilies.map(sf => (
            <option key={sf} value={sf}>{sf}</option>
          ))}
        </select>

        {/* Reviewed state filter */}
        <select
          value={filterReviewed}
          onChange={e => setFilterReviewed(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: filterReviewed !== 'all' ? '#eff6ff' : '#fff' }}
        >
          <option value="all">Reviewed &amp; unreviewed</option>
          <option value="unreviewed">Unreviewed only</option>
          <option value="reviewed">Reviewed only</option>
        </select>

        {/* Toggle filters */}
        {[
          { key: 'target', label: '🎯 Target employer', val: filterTargetOnly, set: setFilterTargetOnly },
          { key: 'direct', label: '✓ Direct only', val: filterDirectOnly, set: setFilterDirectOnly },
          { key: 'rec',    label: '👍 Recommended', val: filterRecommendedOnly, set: setFilterRecommendedOnly },
          { key: 'hf',     label: '⭐ High-fit', val: filterHighFitOnly, set: setFilterHighFitOnly },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => f.set(!f.val)}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid',
              cursor: 'pointer', fontWeight: 600,
              background: f.val ? '#3b82f6' : '#fff',
              color: f.val ? '#fff' : '#6b7280',
              borderColor: f.val ? '#3b82f6' : '#d1d5db',
            }}
          >
            {f.label}
          </button>
        ))}

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid #f87171', cursor: 'pointer', background: '#fef2f2', color: '#b91c1c', fontWeight: 600 }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkActionBar({
  selectedIds, allFilteredOpps,
  onSelectAll, onClearSelection,
  onBulkReject, onBulkArchiveLowSignal, onBulkMarkReviewed, onBulkAddNote,
  processing,
}) {
  const [noteText, setNoteText] = useState('');
  const count = selectedIds.size;
  const allSelected = allFilteredOpps.length > 0 && count === allFilteredOpps.length;

  return (
    <div style={{
      background: count > 0 ? '#fef3c7' : '#f8fafc',
      border: `1px solid ${count > 0 ? '#fcd34d' : '#e2e8f0'}`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 12,
      transition: 'background 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Select all / clear */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={e => e.target.checked ? onSelectAll() : onClearSelection()}
          />
          <span style={{ fontWeight: 600, color: '#475569' }}>
            {count > 0 ? `${count} selected` : 'Select all'}
          </span>
        </label>

        {count > 0 && (
          <>
            <button
              className="btn btn-danger btn-sm"
              style={{ fontSize: 12 }}
              disabled={!!processing}
              onClick={onBulkReject}
            >
              ✕ Reject selected ({count})
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12, background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}
              disabled={!!processing}
              onClick={onBulkMarkReviewed}
            >
              ✓ Mark reviewed ({count})
            </button>
            <input
              style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid #d1d5db', width: 160 }}
              placeholder="Note / tag to add"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <button
              className="btn btn-sm"
              style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd' }}
              disabled={!!processing || !noteText.trim()}
              onClick={() => { onBulkAddNote(noteText); setNoteText(''); }}
            >
              Add note
            </button>
            <button
              onClick={onClearSelection}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', color: '#6b7280', fontWeight: 600 }}
            >
              Deselect
            </button>
          </>
        )}

        {/* Bulk archive low-signal (no selection needed) */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-sm"
            style={{ fontSize: 11, background: '#fafafa', color: '#6b7280', border: '1px solid #d1d5db' }}
            disabled={!!processing}
            onClick={onBulkArchiveLowSignal}
          >
            🗑 Archive all low-signal
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ApprovalQueue() {
  const { state, loadOpportunities, notify } = useApp();
  const nav = useNavigate();
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(null);
  const [sortBy, setSortBy] = useState('fit'); // 'fit' | 'readiness'

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [filterLane, setFilterLane] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterTargetOnly, setFilterTargetOnly] = useState(false);
  const [filterDirectOnly, setFilterDirectOnly] = useState(false);
  const [filterRecommendedOnly, setFilterRecommendedOnly] = useState(false);
  const [filterHighFitOnly, setFilterHighFitOnly] = useState(false);
  const [filterReviewed, setFilterReviewed] = useState('all');

  // ── Base pending list ────────────────────────────────────────────────────────
  const allPending = useMemo(() =>
    state.opportunities.filter(o =>
      o.approval_state === 'pending' &&
      !['rejected', 'ghosted', 'stale'].includes(o.status)
    ),
  [state.opportunities]);

  // ── Filtered + sorted list ───────────────────────────────────────────────────
  const filteredSorted = useMemo(() => {
    let list = allPending.filter(o => {
      if (filterLane !== 'all' && o.lane !== filterLane) return false;
      if (filterSource !== 'all' && (o.source_family || 'manual') !== filterSource) return false;
      if (filterTargetOnly && !isTargetEmployer(o.company)) return false;
      if (filterDirectOnly && classifyEmployerType(o.company) !== EMPLOYER_TYPE.DIRECT) return false;
      if (filterRecommendedOnly && !o.recommended) return false;
      if (filterHighFitOnly && (o.fit_score || 0) < 70) return false;
      if (filterReviewed === 'reviewed' && !o.queue_reviewed) return false;
      if (filterReviewed === 'unreviewed' && o.queue_reviewed) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'readiness') {
        const ra = a.pack_readiness_score || 0;
        const rb = b.pack_readiness_score || 0;
        if (rb !== ra) return rb - ra;
      }
      return (b.fit_score || 0) - (a.fit_score || 0);
    });
  }, [allPending, filterLane, filterSource, filterTargetOnly, filterDirectOnly,
      filterRecommendedOnly, filterHighFitOnly, filterReviewed, sortBy]);

  // ── Tiered groups ────────────────────────────────────────────────────────────
  const { highFit, standard, weakFit } = useMemo(() => ({
    highFit:  filteredSorted.filter(o => (o.fit_score || 0) >= 70 && o.recommended),
    standard: filteredSorted.filter(o => (o.fit_score || 0) >= 50 && ((o.fit_score || 0) < 70 || !o.recommended)),
    weakFit:  filteredSorted.filter(o => (o.fit_score || 0) < 50),
  }), [filteredSorted]);

  const total = filteredSorted.length;

  // ── Per-card approve/reject handler ─────────────────────────────────────────
  const handle = async (opp, action) => {
    setProcessing(opp.id);
    try {
      await approveOpportunity(opp.id, action, reason);
      await loadOpportunities();
      notify(`Opportunity ${action}d.`, action === 'approve' ? 'success' : 'info');
      setReason('');
      if (action === 'approve') nav(`/apply-pack/${opp.id}`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  // ── Bulk action handlers ─────────────────────────────────────────────────────

  // Bulk reject: reject each selected opportunity individually (no auto-approve)
  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setProcessing('bulk');
    try {
      for (const id of ids) {
        await approveOpportunity(id, 'reject', 'Bulk rejected');
      }
      setSelectedIds(new Set());
      await loadOpportunities();
      notify(`${ids.length} opportunit${ids.length === 1 ? 'y' : 'ies'} rejected.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  // Bulk archive low-signal: reject all visible roles with fit_score < 50
  const handleBulkArchiveLowSignal = async () => {
    const lowSignal = filteredSorted.filter(o => (o.fit_score || 0) < 50 && !o.recommended);
    if (lowSignal.length === 0) {
      notify('No low-signal roles in current view.', 'info');
      return;
    }
    setProcessing('bulk');
    try {
      for (const opp of lowSignal) {
        await approveOpportunity(opp.id, 'reject', 'Bulk archive: low-signal');
      }
      setSelectedIds(new Set());
      await loadOpportunities();
      notify(`${lowSignal.length} low-signal role${lowSignal.length === 1 ? '' : 's'} archived.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  // Bulk mark reviewed: flag selected as reviewed without changing approval state
  const handleBulkMarkReviewed = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setProcessing('bulk');
    try {
      for (const id of ids) {
        await updateOpportunity(id, { queue_reviewed: true });
      }
      setSelectedIds(new Set());
      await loadOpportunities();
      notify(`${ids.length} role${ids.length === 1 ? '' : 's'} marked as reviewed.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  // Bulk add note/tag: append note text to all selected opportunities
  const handleBulkAddNote = async (noteText) => {
    if (selectedIds.size === 0 || !noteText.trim()) return;
    const ids = [...selectedIds];
    setProcessing('bulk');
    try {
      for (const id of ids) {
        const existing = state.opportunities.find(o => o.id === id);
        const currentNote = (existing?.notes || '').trim();
        const newNote = currentNote ? `${currentNote}; ${noteText.trim()}` : noteText.trim();
        await updateOpportunity(id, { notes: newNote });
      }
      setSelectedIds(new Set());
      await loadOpportunities();
      notify(`Note added to ${ids.length} role${ids.length === 1 ? '' : 's'}.`, 'info');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  // ── Render a single opportunity card ────────────────────────────────────────
  const renderOpp = (opp) => {
    const isSelected = selectedIds.has(opp.id);
    const isHighFitRecommended = (opp.fit_score || 0) >= 70 && opp.recommended;

    return (
      <div
        key={opp.id}
        className="card card-pad"
        style={{
          borderLeft: isHighFitRecommended ? '4px solid var(--green)' : undefined,
          outline: isSelected ? '2px solid #3b82f6' : undefined,
          outlineOffset: 1,
        }}
      >
        {/* Row: checkbox + card + fit chip */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(opp.id)}
            style={{ marginTop: 4, cursor: 'pointer', flexShrink: 0 }}
            aria-label={`Select ${opp.title}`}
          />
          <div style={{ flex: 1 }}>
            <OpportunityCard opp={opp} />
          </div>
          <FitPriorityChip opp={opp} />
        </div>

        {/* Signal badges (direct employer, intermediary, target, off-strategy, etc.) */}
        <SignalBadges opp={opp} />

        {/* Decision support: weakness reasons */}
        <WeaknessPanel opp={opp} />

        {/* Readiness indicator */}
        <ReadinessBadge opp={opp} />

        {/* Missing apply URL warning */}
        {!opp.application_url && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#c2410c', background: '#fff7ed', borderRadius: 4, padding: '4px 8px' }}>
            ⚠ No apply URL set — add one after approving to unlock full readiness
          </div>
        )}

        {/* Per-card approve / reject */}
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
            disabled={!!processing}
            onClick={() => handle(opp, 'approve')}
          >
            ✓ Approve
          </button>
          <button
            className="btn btn-danger"
            disabled={!!processing}
            onClick={() => handle(opp, 'reject')}
          >
            ✕ Reject
          </button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const activeFilterCount = [
    filterLane !== 'all', filterSource !== 'all', filterTargetOnly,
    filterDirectOnly, filterRecommendedOnly, filterHighFitOnly, filterReviewed !== 'all',
  ].filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div>
          <h1 className="section-title">Approval Queue</h1>
          <p className="section-sub">
            All role approvals are human-controlled. Review each opportunity before it can be applied to.
          </p>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Sort by:</span>
            <button
              className={`btn btn-sm ${sortBy === 'fit' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSortBy('fit')}
            >Fit Score</button>
            <button
              className={`btn btn-sm ${sortBy === 'readiness' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setSortBy('readiness')}
            >Readiness</button>
          </div>
        )}
      </div>

      {/* Filters (always shown when there are pending roles) */}
      {allPending.length > 0 && (
        <FilterBar
          opps={allPending}
          filterLane={filterLane} setFilterLane={setFilterLane}
          filterSource={filterSource} setFilterSource={setFilterSource}
          filterTargetOnly={filterTargetOnly} setFilterTargetOnly={setFilterTargetOnly}
          filterDirectOnly={filterDirectOnly} setFilterDirectOnly={setFilterDirectOnly}
          filterRecommendedOnly={filterRecommendedOnly} setFilterRecommendedOnly={setFilterRecommendedOnly}
          filterHighFitOnly={filterHighFitOnly} setFilterHighFitOnly={setFilterHighFitOnly}
          filterReviewed={filterReviewed} setFilterReviewed={setFilterReviewed}
          activeCount={activeFilterCount}
        />
      )}

      {/* Bulk action bar */}
      {allPending.length > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          allFilteredOpps={filteredSorted}
          onSelectAll={() => setSelectedIds(new Set(filteredSorted.map(o => o.id)))}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkReject={handleBulkReject}
          onBulkArchiveLowSignal={handleBulkArchiveLowSignal}
          onBulkMarkReviewed={handleBulkMarkReviewed}
          onBulkAddNote={handleBulkAddNote}
          processing={processing}
        />
      )}

      {/* Queue content */}
      {total === 0 ? (
        <div className="card approval-empty">
          <div className="approval-empty__icon">✅</div>
          <div className="approval-empty__title">
            {allPending.length > 0 ? 'No roles match current filters' : 'Queue is clear'}
          </div>
          <div className="text-muted text-sm">
            {allPending.length > 0
              ? 'Adjust the filters above to show more roles.'
              : 'New opportunities discovered by intake will appear here for review.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* High Fit Group */}
          {highFit.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>⭐ High-Fit — Approve First</span>
                <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{highFit.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {highFit.map(renderOpp)}
              </div>
            </div>
          )}

          {/* Standard Group */}
          {standard.length > 0 && (
            <div style={{ marginTop: highFit.length > 0 ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>📋 Standard — Review</span>
                <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{standard.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {standard.map(renderOpp)}
              </div>
            </div>
          )}

          {/* Weak Fit Group */}
          {weakFit.length > 0 && (
            <div style={{ marginTop: (highFit.length + standard.length) > 0 ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>⬇ Weak Fit — Low Priority</span>
                <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{weakFit.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {weakFit.map(renderOpp)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approval gate reminder */}
      <div className="card" style={{ marginTop: 24, padding: '14px 20px', background: 'var(--amber-light)', border: '1px solid #fcd34d' }}>
        <strong>Approval gate enforced.</strong> Opportunities cannot be applied to until explicitly approved here.
        No LinkedIn automation. No browser-bot flows. All outreach and submission are human-initiated.
        Bulk actions cannot approve roles — only individual per-card approval is supported.
      </div>
    </div>
  );
}

