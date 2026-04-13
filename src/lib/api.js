/**
 * Frontend API Client
 *
 * Detects demo mode and routes accordingly:
 * - Demo mode (VITE_DEMO_MODE=true or no Supabase keys): uses localStorage + demo data
 * - Production mode: calls Netlify Functions at /.netlify/functions/*
 */

import { scoreOpportunity, getRecommendation } from '../../netlify/functions/_shared/scoring.js';
import { generateDedupHash } from '../../netlify/functions/_shared/dedup.js';
import { evaluateStaleness, computeNextAction } from '../../netlify/functions/_shared/stale.js';
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

// ─── Reset Demo Data ──────────────────────────────────────────────────────────

export function resetDemoData() {
  localStorage.removeItem(STORE_KEY);
}
