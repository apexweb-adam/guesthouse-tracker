/**
 * Frontend API Client
 *
 * Detects demo mode and routes accordingly:
 * - Demo mode (VITE_DEMO_MODE=true or no Supabase keys): uses localStorage + demo data
 * - Production mode: calls Netlify Functions at /.netlify/functions/*
 */

import { scoreOpportunity, getRecommendation, LANE_CONFIG } from '../../netlify/functions/_shared/scoring.js';
import { generateDedupHash } from '../../netlify/functions/_shared/dedup.js';
import { evaluateStaleness, scanForStale, computeNextAction } from '../../netlify/functions/_shared/stale.js';
import { generateApplyPack, applyResumeOverride, regenerateApplyPack, computePackReadinessScore } from '../../netlify/functions/_shared/applyPack.js';
import { DEFAULT_SOURCES } from '../../netlify/functions/_shared/sources.js';
import { DEMO_OPPORTUNITIES, DEMO_LOGS } from './demoData.js';

// ─── Mode Detection ───────────────────────────────────────────────────────────

export function isDemoMode() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
  if (!import.meta.env.VITE_SUPABASE_URL) return true;
  return false;
}

const BASE = '/.netlify/functions';

// ─── Demo Store (localStorage) ────────────────────────────────────────────────

const STORE_KEY = 'job-search-os-v1';

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

function getStore() {
  const existing = loadStore();
  if (existing) return existing;
  // Seed with demo data on first load
  const store = {
    opportunities: DEMO_OPPORTUNITIES,
    sources: DEFAULT_SOURCES,
    logs: DEMO_LOGS,
  };
  saveStore(store);
  return store;
}

function mutateStore(fn) {
  const store = getStore();
  fn(store);
  saveStore(store);
  return store;
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Opportunities ────────────────────────────────────────────────────────────

export async function fetchOpportunities(filters = {}) {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    let results = [...opportunities];
    if (filters.status) results = results.filter(o => o.status === filters.status);
    if (filters.lane) results = results.filter(o => o.lane === filters.lane);
    if (filters.recommended !== undefined) results = results.filter(o => o.recommended === filters.recommended);
    // Enrich with staleness
    return results.map(o => ({ ...o, ...evaluateStaleness(o) }));
  }
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined))
  );
  return apiFetch(`/opportunities?${params}`).then(d => d.opportunities);
}

export async function fetchOpportunity(id) {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp) return null;
    return { ...opp, ...evaluateStaleness(opp) };
  }
  return apiFetch(`/opportunities?id=${id}`);
}

export async function createOpportunity(fields) {
  if (isDemoMode()) {
    const store = getStore();
    const hash = generateDedupHash(fields);
    const existingHashes = store.opportunities.map(o => o.dedup_hash);
    if (existingHashes.includes(hash)) {
      return { duplicate: true, message: 'Opportunity already exists.' };
    }
    const scoring = scoreOpportunity(fields.title, fields.description);
    const now = new Date().toISOString();
    const opp = {
      id: `opp-${Date.now()}`,
      ...fields,
      dedup_hash: hash,
      is_duplicate: false,
      lane: scoring.lane,
      fit_score: scoring.score,
      fit_signals: scoring.signals,
      recommended: scoring.recommended,
      high_fit: scoring.highFit,
      resume_emphasis: scoring.resumeEmphasis,
      recommendation_text: getRecommendation(scoring.lane, scoring.score),
      status: 'discovered',
      approval_state: 'pending',
      ingested_at: now,
      source: fields.source || 'src-manual',
      human_override: null,
      notes: '',
    };
    mutateStore(s => s.opportunities.unshift(opp));
    return { opportunity: opp };
  }
  return apiFetch('/opportunities', { method: 'POST', body: JSON.stringify(fields) });
}

export async function updateOpportunity(id, updates) {
  if (isDemoMode()) {
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], ...updates };
    });
    const { opportunities } = getStore();
    return { opportunity: opportunities.find(o => o.id === id) };
  }
  return apiFetch(`/opportunities?id=${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

// ─── Approval ─────────────────────────────────────────────────────────────────

export async function approveOpportunity(id, action, reason = '', overrideFields = {}) {
  if (isDemoMode()) {
    const now = new Date().toISOString();
    const store = getStore();
    const opp = store.opportunities.find(o => o.id === id);
    if (!opp) throw new Error('Not found');
    const audit = {
      action,
      reason,
      decided_at: now,
      original_recommendation: opp.recommended,
      original_fit_score: opp.fit_score,
      original_lane: opp.lane,
    };
    const updates = {
      approval_state: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : opp.approval_state,
      status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : opp.status,
      human_override: audit,
      last_action_date: now,
      ...overrideFields,
    };
    // Auto-generate Apply Pack on approval
    if (action === 'approve') {
      try {
        const oppForPack = { ...opp, ...updates, approval_state: 'approved' };
        const pack = generateApplyPack(oppForPack);
        updates.apply_pack = pack;
        // If this is a manual external role with no apply URL, flag the missing URL clearly
        const hasApplyUrl = !!(opp.application_url || '').trim();
        if (opp.is_manual_external_intake && !hasApplyUrl) {
          updates.status = 'needs_apply_url';
          updates.apply_pack_missing_url = true;
        } else {
          updates.status = 'apply_pack_generated';
          updates.apply_pack_missing_url = false;
        }
      } catch (e) {
        console.warn('[api] Apply Pack generation failed (non-fatal):', e.message);
      }
    }
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], ...updates };
    });
    return { opportunity: { ...opp, ...updates }, audit };
  }
  return apiFetch('/approve', {
    method: 'POST',
    body: JSON.stringify({ id, action, reason, overrideFields }),
  });
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

export async function importCSV(csvText) {
  if (isDemoMode()) {
    // Run same CSV parse + intake locally
    const res = await fetch('/.netlify/functions/csv-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText }),
    }).catch(() => null);

    // If functions not available in dev, parse inline
    const rows = parseCSVInline(csvText);
    const store = getStore();
    const existingHashes = store.opportunities.map(o => o.dedup_hash);
    const inserted = [];
    const deduped = [];

    for (const row of rows) {
      if (!row.title) continue;
      const hash = generateDedupHash(row);
      if (existingHashes.includes(hash)) { deduped.push(row); continue; }
      const scoring = scoreOpportunity(row.title, row.description);
      const opp = {
        id: `opp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        ...row,
        dedup_hash: hash,
        is_duplicate: false,
        lane: scoring.lane,
        fit_score: scoring.score,
        fit_signals: scoring.signals,
        recommended: scoring.recommended,
        high_fit: scoring.highFit,
        resume_emphasis: scoring.resumeEmphasis,
        recommendation_text: getRecommendation(scoring.lane, scoring.score),
        status: 'discovered',
        approval_state: 'pending',
        ingested_at: new Date().toISOString(),
        source: 'src-csv',
        human_override: null,
        notes: '',
      };
      inserted.push(opp);
      existingHashes.push(hash);
    }
    mutateStore(s => { s.opportunities.unshift(...inserted); });
    return { summary: { rows_parsed: rows.length, new: inserted.length, deduped: deduped.length, errors: 0 }, inserted };
  }
  return apiFetch('/csv-import', { method: 'POST', body: JSON.stringify({ csv: csvText }) });
}

function parseCSVInline(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    const get = (...keys) => { for (const k of keys) if (row[k]) return row[k]; return ''; };
    return {
      title: get('title', 'job_title', 'role'),
      company: get('company', 'employer'),
      location: get('location', 'city'),
      url: get('url', 'link'),
      description: get('description', 'desc'),
    };
  });
}

// ─── Quick Add from External Posting ─────────────────────────────────────────

/**
 * Quick Add from External Posting.
 *
 * Accepts user-pasted job data from LinkedIn or any external source.
 * The backend scores, deduplicates, and queues the role for approval.
 * This does NOT scrape LinkedIn — the user provides all text.
 *
 * @param {object} fields
 * @param {string} fields.reference_posting_url  Where the user found the role (required)
 * @param {string} fields.pasted_jd_text         Full JD text pasted by the user (required)
 * @param {string} fields.title                  Role title (required)
 * @param {string} fields.company                Company name (required)
 * @param {string} [fields.external_apply_url]   Direct apply URL if available
 * @param {string} [fields.location]
 * @param {string} [fields.notes]
 */
export async function quickAddOpportunity(fields) {
  const {
    reference_posting_url = '',
    pasted_jd_text = '',
    external_apply_url = '',
    title = '',
    company = '',
    location = '',
    notes = '',
  } = fields;

  // Client-side validation for fast feedback
  if (!reference_posting_url.trim()) throw new Error('Reference URL is required.');
  if (!pasted_jd_text.trim()) throw new Error('Pasted job description text is required.');
  if (!title.trim()) throw new Error('Role title is required.');
  if (!company.trim()) throw new Error('Company name is required.');

  if (isDemoMode()) {
    const store = getStore();
    // Dedup check
    const isLinkedIn = /linkedin\.com/i.test(reference_posting_url);
    const dedupUrl = external_apply_url.trim() || (!isLinkedIn ? reference_posting_url.trim() : '');
    const hash = generateDedupHash({ title: title.trim(), company: company.trim(), url: dedupUrl });
    const existingHashes = store.opportunities.map(o => o.dedup_hash);
    if (existingHashes.includes(hash)) {
      return {
        ok: true,
        duplicate: true,
        message: 'This opportunity already exists in your queue (deduplicated). No duplicate was created.',
      };
    }

    // Score using pasted JD as source of truth
    const scoring = scoreOpportunity(title.trim(), pasted_jd_text.trim());
    const now = new Date().toISOString();
    const opp = {
      id: `opp-${Date.now()}`,
      title: title.trim(),
      company: company.trim(),
      location: location.trim() || null,
      description: pasted_jd_text.trim(),

      // URL model
      url: external_apply_url.trim() || (!isLinkedIn ? reference_posting_url.trim() : null),
      canonical_job_url: external_apply_url.trim() || (!isLinkedIn ? reference_posting_url.trim() : null),
      application_url: external_apply_url.trim() || null,
      reference_posting_url: reference_posting_url.trim(),

      // Source / provenance
      source: 'src-manual-external',
      source_family: 'manual_external',
      source_type: 'manual',
      source_job_id: null,
      is_demo_record: false,
      is_manual_external_intake: true,
      intake_source_is_linkedin: isLinkedIn,

      // Scoring
      dedup_hash: hash,
      is_duplicate: false,
      lane: scoring.lane,
      fit_score: scoring.score,
      fit_signals: scoring.signals,
      recommended: scoring.recommended,
      high_fit: scoring.highFit,
      resume_emphasis: scoring.resumeEmphasis,
      recommendation_text: getRecommendation(scoring.lane, scoring.score),

      // Workflow
      status: 'discovered',
      approval_state: 'pending',
      ingested_at: now,
      discovered_at: now,
      human_override: null,
      notes: notes.trim() || '',
    };
    mutateStore(s => s.opportunities.unshift(opp));
    return {
      ok: true,
      duplicate: false,
      demo: true,
      intake_source_is_linkedin: isLinkedIn,
      opportunity: opp,
      message: isLinkedIn
        ? 'Role added from LinkedIn reference. The system has NOT fetched LinkedIn — purely paste-based intake.'
        : 'Role added successfully and queued for approval.',
    };
  }

  // Production: call /quick-add function
  const res = await fetch('/.netlify/functions/quick-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference_posting_url, pasted_jd_text, external_apply_url, title, company, location, notes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Quick Add failed');
  return data;
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export async function fetchSources() {
  if (isDemoMode()) {
    const { sources, logs } = getStore();
    return {
      sources: sources.map(s => {
        const sLogs = logs.filter(l => l.source_id === s.id);
        return {
          ...s,
          last_run: sLogs[0]?.run_at || null,
          last_status: sLogs[0]?.status || null,
          total_imported: sLogs.reduce((n, l) => n + (l.count_new || 0), 0),
          total_deduped: sLogs.reduce((n, l) => n + (l.count_deduped || 0), 0),
          total_failures: sLogs.filter(l => l.status === 'failure').length,
          total_high_review: sLogs.reduce((n, l) => n + (l.count_high_review || 0), 0),
          noisy_warning: false,
        };
      }),
      liveIntakeEnabled: false,
      demo: true,
    };
  }
  return apiFetch('/sources');
}

export async function toggleSource(id, enabled) {
  if (isDemoMode()) {
    mutateStore(s => {
      const idx = s.sources.findIndex(src => src.id === id);
      if (idx >= 0) s.sources[idx] = { ...s.sources[idx], enabled };
    });
    return { source: getStore().sources.find(s => s.id === id) };
  }
  return apiFetch('/sources', { method: 'PATCH', body: JSON.stringify({ id, enabled }) });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export async function fetchLogs(params = {}) {
  if (isDemoMode()) {
    const { logs } = getStore();
    return { logs, count: logs.length, demo: true };
  }
  const qs = new URLSearchParams(params);
  return apiFetch(`/logs?${qs}`);
}

// ─── Prep Package ─────────────────────────────────────────────────────────────

export async function fetchPrep(id) {
  if (isDemoMode()) {
    const { generatePrepPackage } = await import('../../netlify/functions/_shared/prep.js');
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp) throw new Error('Opportunity not found');
    return { prep: generatePrepPackage(opp) };
  }
  return apiFetch(`/prep?id=${encodeURIComponent(id)}`);
}

// ─── Digests & Reporting ──────────────────────────────────────────────────────

export async function fetchDigest(type = 'approval') {
  if (isDemoMode()) {
    const { opportunities, logs } = getStore();
    const now = new Date().toISOString();

    if (type === 'approval') {
      const pending = opportunities
        .filter(o => o.approval_state === 'pending' && !['rejected', 'ghosted', 'stale'].includes(o.status))
        .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));
      return {
        digest: {
          type: 'approval',
          summary: `${pending.length} opportunit${pending.length === 1 ? 'y' : 'ies'} pending approval`,
          totalPending: pending.length,
          recommendedCount: pending.filter(o => o.recommended).length,
          highFitCount: pending.filter(o => o.high_fit).length,
          topOpportunities: pending.slice(0, 5).map(o => ({
            id: o.id, title: o.title, company: o.company,
            fitScore: o.fit_score, recommended: o.recommended,
            laneLabel: LANE_CONFIG[o.lane]?.label || o.lane,
          })),
          generatedAt: now,
        },
      };
    }

    if (type === 'stale') {
      const active = opportunities.filter(o => ['applied', 'interviewing', 'offer', 'approved'].includes(o.status));
      const enriched = active.map(o => ({ ...o, ...evaluateStaleness(o) }));
      const stale = scanForStale(enriched);
      return {
        digest: {
          type: 'stale',
          summary: `${stale.length} opportunit${stale.length === 1 ? 'y' : 'ies'} need follow-up`,
          totalStale: stale.length,
          ghostedCount: stale.filter(o => o.isGhosted).length,
          staleCount: stale.filter(o => o.isStale && !o.isGhosted).length,
          items: stale.map(o => ({
            id: o.id, title: o.title, company: o.company, status: o.status,
            daysSinceAction: o.daysSinceAction, isGhosted: o.isGhosted,
            reason: o.reason, suggestedAction: o.suggestedAction,
          })),
          generatedAt: now,
        },
      };
    }

    if (type === 'weekly') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      return {
        digest: {
          type: 'weekly',
          summary: 'Weekly digest (demo data)',
          newThisWeek: opportunities.filter(o => o.ingested_at >= sevenDaysAgo).length,
          funnel: {
            discovered: opportunities.filter(o => ['discovered', 'queued'].includes(o.status)).length,
            pendingApproval: opportunities.filter(o => o.approval_state === 'pending').length,
            approved: opportunities.filter(o => o.approval_state === 'approved').length,
            applied: opportunities.filter(o => o.status === 'applied').length,
            interviewing: opportunities.filter(o => o.status === 'interviewing').length,
            offers: opportunities.filter(o => o.status === 'offer').length,
            rejected: opportunities.filter(o => o.status === 'rejected').length,
          },
          ingestion: {
            runsTotal: logs.length,
            newJobsIngested: logs.reduce((n, l) => n + (l.count_new || 0), 0),
            dedupedTotal: logs.reduce((n, l) => n + (l.count_deduped || 0), 0),
            failures: 0,
          },
          generatedAt: now,
        },
      };
    }

    // ingestion
    const bySource = {};
    for (const log of logs) {
      if (!bySource[log.source_id]) {
        bySource[log.source_id] = { sourceId: log.source_id, totalNew: 0, totalDeduped: 0, failures: 0, lastRun: null, lastStatus: null };
      }
      const s = bySource[log.source_id];
      s.totalNew += log.count_new || 0;
      s.totalDeduped += log.count_deduped || 0;
      if (log.status === 'failure') s.failures++;
      if (!s.lastRun || log.run_at > s.lastRun) { s.lastRun = log.run_at; s.lastStatus = log.status; }
    }
    return {
      digest: {
        type: 'ingestion',
        summary: `${logs.length} ingestion log entries`,
        sourceSummaries: Object.values(bySource),
        recentLogs: logs.slice(0, 10),
        generatedAt: now,
      },
    };
  }

  return apiFetch(`/digest?type=${encodeURIComponent(type)}`);
}


// ─── Export / Backup ──────────────────────────────────────────────────────────

export async function triggerExport(format = 'json') {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const filename = `job-search-export-${new Date().toISOString().slice(0, 10)}.${format}`;
    let content, mimeType;
    if (format === 'csv') {
      const cols = ['id', 'title', 'company', 'location', 'lane', 'fit_score', 'recommended', 'status', 'approval_state', 'source', 'ingested_at'];
      const esc = v => { const s = String(v ?? ''); return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s; };
      content = [cols.join(','), ...opportunities.map(o => cols.map(c => esc(o[c])).join(','))].join('\n');
      mimeType = 'text/csv';
    } else {
      content = JSON.stringify({ exportedAt: new Date().toISOString(), count: opportunities.length, opportunities }, null, 2);
      mimeType = 'application/json';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return { exported: true, count: opportunities.length, filename };
  }
  const res = await fetch(`${BASE}/export?format=${format}`);
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : `export.${format}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return { exported: true, filename };
}

// ─── Reset Demo Data ──────────────────────────────────────────────────────────

export function resetDemoData() {
  localStorage.removeItem(STORE_KEY);
}

// ─── Apply Pack ───────────────────────────────────────────────────────────────

export async function fetchApplyPack(id) {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp) throw new Error('Opportunity not found');
    if (opp.apply_pack) return { apply_pack: opp.apply_pack, opportunity: opp };
    if (opp.approval_state !== 'approved') {
      throw new Error('Apply Pack requires approval. Approve this opportunity first.');
    }
    // Auto-generate if approved but pack not yet on record
    const pack = generateApplyPack(opp);
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = {
        ...s.opportunities[idx],
        apply_pack: pack,
        status: 'apply_pack_generated',
      };
    });
    return { apply_pack: pack, opportunity: { ...opp, apply_pack: pack, status: 'apply_pack_generated' }, generated: true };
  }
  return apiFetch(`/apply-pack?id=${encodeURIComponent(id)}`);
}

export async function regenerateApplyPackApi(id) {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp) throw new Error('Opportunity not found');
    if (opp.approval_state !== 'approved') throw new Error('Cannot regenerate: opportunity not approved');
    const fresh = regenerateApplyPack(opp, opp.apply_pack);
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], apply_pack: fresh };
    });
    return { apply_pack: fresh };
  }
  return apiFetch('/apply-pack', { method: 'POST', body: JSON.stringify({ id, action: 'regenerate' }) });
}

export async function overrideResumeVersion(id, overrideVersion, overrideReason = '') {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp || !opp.apply_pack) throw new Error('No Apply Pack found for this opportunity');
    const updated_pack = applyResumeOverride(opp.apply_pack, overrideVersion, overrideReason);
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], apply_pack: updated_pack };
    });
    return { apply_pack: updated_pack };
  }
  return apiFetch('/apply-pack', {
    method: 'POST',
    body: JSON.stringify({ id, action: 'override_resume', overrideVersion, overrideReason }),
  });
}

export async function updateChecklistItem(id, itemId, done) {
  if (isDemoMode()) {
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp || !opp.apply_pack) throw new Error('No Apply Pack found');
    const updated_pack = {
      ...opp.apply_pack,
      apply_checklist: opp.apply_pack.apply_checklist.map(item =>
        item.id === itemId ? { ...item, done: !!done } : item
      ),
    };
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], apply_pack: updated_pack };
    });
    return { apply_pack: updated_pack };
  }
  return apiFetch('/apply-pack', {
    method: 'POST',
    body: JSON.stringify({ id, action: 'update_checklist', itemId, done }),
  });
}

/**
 * Update the application URL for a manually-added external role.
 * Once added, the status advances from needs_apply_url → apply_pack_generated.
 */
export async function updateApplyUrl(id, applicationUrl) {
  if (isDemoMode()) {
    const now = new Date().toISOString();
    const { opportunities } = getStore();
    const opp = opportunities.find(o => o.id === id);
    if (!opp) throw new Error('Opportunity not found');
    const updates = {
      application_url: applicationUrl.trim(),
      canonical_job_url: opp.canonical_job_url || applicationUrl.trim(),
      apply_pack_missing_url: false,
      last_action_date: now,
    };
    // Advance status if it was blocked on missing URL
    if (opp.status === 'needs_apply_url') {
      updates.status = 'apply_pack_generated';
    }
    // Regenerate Apply Pack if it was generated without an apply URL
    if (opp.apply_pack && opp.apply_pack.apply_url_missing_at_generation) {
      try {
        const oppWithUrl = { ...opp, application_url: applicationUrl.trim() };
        const refreshedPack = regenerateApplyPack(oppWithUrl, opp.apply_pack, 'apply_url_added');
        updates.apply_pack = refreshedPack;
        updates.pack_readiness_score = refreshedPack.pack_readiness_score || 0;
      } catch (_e) {
        // Non-fatal: shallow patch
        updates.apply_pack = {
          ...opp.apply_pack,
          application_url: applicationUrl.trim(),
          apply_url_added_at: now,
          apply_url_missing_at_generation: false,
        };
      }
    } else if (opp.apply_pack) {
      updates.apply_pack = {
        ...opp.apply_pack,
        application_url: applicationUrl.trim(),
        apply_url_added_at: now,
      };
    }
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], ...updates };
    });
    const updated = getStore().opportunities.find(o => o.id === id);
    return { opportunity: updated };
  }
  return apiFetch(`/opportunities?id=${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      application_url: applicationUrl.trim(),
      apply_pack_missing_url: false,
      status_advance_from_needs_apply_url: true,
    }),
  });
}

export async function updateApplyStatus(id, status) {
  if (isDemoMode()) {
    const now = new Date().toISOString();
    const statusUpdates = { status, last_action_date: now };
    if (status === 'applied') statusUpdates.applied_date = now;
    mutateStore(s => {
      const idx = s.opportunities.findIndex(o => o.id === id);
      if (idx >= 0) s.opportunities[idx] = { ...s.opportunities[idx], ...statusUpdates };
    });
    const { opportunities } = getStore();
    return { opportunity: opportunities.find(o => o.id === id) };
  }
  return apiFetch('/apply-pack', {
    method: 'POST',
    body: JSON.stringify({ id, action: 'update_status', status }),
  });
}

// ─── Discovery Trigger ─────────────────────────────────────────────────────
/**
 * Trigger a job discovery run via POST /discover.
 * Requires the DISCOVERY_SECRET env var to be configured server-side.
 * The secret is passed via the UI only in demo mode (no-op) or via a
 * server-to-server call in live mode.
 *
 * @param {object} opts
 * @param {string} [opts.sourceId]        — run a single source
 * @param {string} [opts.discoverySecret] — caller must pass DISCOVERY_SECRET
 */
export async function triggerDiscover({ sourceId, discoverySecret } = {}) {
  if (isDemoMode()) {
    return {
      ok: true,
      mode: 'demo',
      message: 'Discovery skipped in demo mode.',
      discovered: 0,
      ingested: 0,
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (discoverySecret) headers['X-Discovery-Secret'] = discoverySecret;
  const res = await fetch(`${BASE}/discover`, {
    method: 'POST',
    headers,
    body: JSON.stringify(sourceId ? { sourceId } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Discovery failed (HTTP ${res.status})`);
  }
  return res.json();
}

// ─── Discovery Profile ────────────────────────────────────────────────────
const PROFILE_STORAGE_KEY = 'discovery_profile_v1';

/**
 * Fetch the active discovery profile.
 *
 * In live mode: loads from server (/profile), with localStorage as emergency fallback.
 * In demo mode: reads from localStorage, falls back to hard-coded defaults.
 *
 * Returns the current profile object.
 */
export async function fetchDiscoveryProfile() {
  // In live mode, prefer server-side persistence
  if (!isDemoMode()) {
    try {
      const res = await apiFetch('/profile');
      if (res && res.profile) {
        // Mirror to localStorage as offline fallback
        try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(res.profile)); } catch {}
        return res.profile;
      }
    } catch {
      // Server unavailable — fall through to localStorage
    }
  }

  // Demo mode or server fallback: try localStorage first
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  // Return the hard-coded defaults (mirrors DEFAULT_DISCOVERY_PROFILE in sources.js)
  return {
    includeTitleKeywords: [
      'technical project manager',
      'it project manager',
      'senior project manager',
      'senior technical project manager',
      'delivery manager',
      'technical delivery manager',
      'programme manager',
      'program manager',
    ],
    excludeTitleKeywords: [
      'junior', 'graduate', 'assistant', 'coordinator', 'entry level',
      'marketing', 'sales', 'hr', 'human resources', 'change manager',
      'construction', 'civil', 'mining',
    ],
    excludeDomainKeywords: [
      'construction', 'civil engineering', 'mining', 'manufacturing',
      'retail operations', 'fmcg', 'logistics operations',
    ],
    locationPreferences: ['sydney', 'australia', 'remote'],
    remotePreference: 'hybrid',
    salaryFloorAUD: null,
    maxRecordsPerRun: 50,
    enabledSourceFamilies: ['greenhouse', 'lever', 'usajobs', 'seek', 'rss'],
  };
}

/**
 * Persist a discovery profile update.
 *
 * In live mode: saves to server (/profile POST), also mirrors to localStorage.
 * In demo mode: saves to localStorage only.
 *
 * @param {object} profile — updated profile object
 */
export async function saveDiscoveryProfile(profile) {
  // Always mirror to localStorage for instant offline access
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {}

  // In live mode, also persist to backend
  if (!isDemoMode()) {
    try {
      await apiFetch('/profile', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      });
      return { saved: true, persisted: 'server' };
    } catch (err) {
      // Server save failed — localStorage copy still exists
      return { saved: true, persisted: 'local_only', warning: err.message };
    }
  }

  return { saved: true, persisted: 'local' };
}
