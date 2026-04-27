/**
 * Database client for Netlify Functions.
 *
 * Uses Supabase when credentials are present.
 * Falls back to in-memory demo store when credentials are absent.
 *
 * IMPORTANT: This file is for server-side (Netlify Functions) use only.
 * The frontend does NOT import this — it calls the Functions via HTTP.
 */

import { createClient } from '@supabase/supabase-js';
import { scoreOpportunity, getRecommendation } from './scoring.js';
import { generateDedupHash } from './dedup.js';

// ─── Supabase Client ──────────────────────────────────────────────────────────

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    // Wrap every Supabase request with an 8-second timeout so functions never
    // exceed Netlify's 10-second limit and return a clean error instead of 502.
    _supabase = createClient(url, key, {
      global: {
        // signal placed after spread so callers cannot accidentally override the timeout.
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      },
    });  } catch (err) {
    console.warn(`[db] Ignoring invalid SUPABASE_URL: ${err.message}`);
    return null;
  }
  return _supabase;
}

export function isDemoMode() {
  try {
    const url = process.env.SUPABASE_URL;
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
    const parsed = new URL(url);
    return !['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return true;
  }
}

// ─── Demo In-Memory Store ──────────────────────────────────────────────────────
// Used when Supabase is not configured.

const _demo = {
  opportunities: [],
  sources: [],
  ingestion_logs: [],
  user_preferences: {},
};

// ─── Opportunities ────────────────────────────────────────────────────────────

const MODERN_OPPORTUNITY_LIST_COLUMNS = [
  'id',
  'title',
  'company',
  'location',
  'lane',
  'fit_score',
  'fit_signals',
  'recommended',
  'high_fit',
  'resume_emphasis',
  'recommendation_text',
  'status',
  'approval_state',
  'source',
  'source_family',
  'source_type',
  'url',
  'canonical_job_url',
  'application_url',
  'reference_posting_url',
  'tracking_url',
  'ingested_at',
  'updated_at',
  'applied_date',
  'last_action_date',
  'next_action',
  'next_action_due',
  'stale_flag',
  'ghosted_flag',
  'apply_pack_missing_url',
  'pack_readiness_score',
  'human_override',
  'notes',
].join(',');

const STABLE_OPPORTUNITY_LIST_COLUMNS = [
  'id',
  'title',
  'company',
  'location',
  'lane',
  'fit_score',
  'fit_signals',
  'recommended',
  'high_fit',
  'resume_emphasis',
  'recommendation_text',
  'status',
  'approval_state',
  'source',
  'url',
  'ingested_at',
  'updated_at',
  'applied_date',
  'last_action_date',
  'next_action',
  'next_action_due',
  'stale_flag',
  'apply_pack_missing_url',
  'pack_readiness_score',
  'human_override',
  'notes',
].join(',');

export async function listOpportunities({ status, lane, recommended } = {}) {
  const sb = getSupabase();
  if (sb) {
    // Keep list responses compact. Full apply_pack/description payloads can push
    // Netlify Functions over the response-size limit once the tracker has lots
    // of generated packs. Detail views still use getOpportunity(id) with select('*').
    let lastError = null;
    for (const columns of [MODERN_OPPORTUNITY_LIST_COLUMNS, STABLE_OPPORTUNITY_LIST_COLUMNS]) {
      let q = sb.from('opportunities').select(columns).order('ingested_at', { ascending: false });
      if (status) q = q.eq('status', status);
      if (lane) q = q.eq('lane', lane);
      if (recommended !== undefined) q = q.eq('recommended', recommended);
      const { data, error } = await q;
      if (!error) return data;
      lastError = error;
      if (!/does not exist|Could not find/i.test(error.message || '')) throw error;
    }
    throw lastError;
  }
  // Demo fallback
  let results = [..._demo.opportunities];
  if (status) results = results.filter(o => o.status === status);
  if (lane) results = results.filter(o => o.lane === lane);
  if (recommended !== undefined) results = results.filter(o => o.recommended === recommended);
  return results;
}

export async function getOpportunity(id) {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('opportunities').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }
  return _demo.opportunities.find(o => o.id === id) || null;
}

export async function getExistingHashes() {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('opportunities').select('dedup_hash');
    if (error) throw error;
    return (data || []).map(r => r.dedup_hash);
  }
  return _demo.opportunities.map(o => o.dedup_hash);
}

function normalizeExistingKey(s = '') {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeExistingUrl(url = '') {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'trk']
      .forEach(k => u.searchParams.delete(k));
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return normalizeExistingKey(url);
  }
}

function opportunityExactKey(opp = {}) {
  const url = opp.url || opp.canonical_job_url || opp.application_url || '';
  return [
    normalizeExistingKey(opp.title),
    normalizeExistingKey(opp.company),
    normalizeExistingKey(opp.location),
    normalizeExistingUrl(url),
  ].join('|');
}

export async function getExistingOpportunityKeys() {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('opportunities')
      .select('title, company, location, url, canonical_job_url, application_url');
    if (error) throw error;
    return (data || []).map(opportunityExactKey);
  }
  return _demo.opportunities.map(opportunityExactKey);
}

/**
 * Fetch existing source_job_id values (for secondary dedup on live discovered roles).
 * Keyed as "source_family:source_job_id" to prevent cross-source false positives.
 */
export async function getExistingSourceJobIds() {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('opportunities')
      .select('source_family, source_job_id')
      .not('source_job_id', 'is', null);
    if (error) return [];
    return (data || []).map(r => `${r.source_family}:${r.source_job_id}`);
  }
  return _demo.opportunities
    .filter(o => o.source_job_id)
    .map(o => `${o.source_family}:${o.source_job_id}`);
}

export async function insertOpportunity(opp) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const record = {
    ...opp,
    id: opp.id || crypto.randomUUID(),
    ingested_at: opp.ingested_at || now,
    status: opp.status || 'discovered',
    approval_state: opp.approval_state || 'pending',
    human_override: null,
  };
  if (sb) {
    const { data, error } = await sb.from('opportunities').insert(record).select().single();
    if (error) throw error;
    return data;
  }
  _demo.opportunities.unshift(record);
  return record;
}

export async function updateOpportunity(id, updates) {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('opportunities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const idx = _demo.opportunities.findIndex(o => o.id === id);
  if (idx < 0) throw new Error(`Opportunity ${id} not found`);
  _demo.opportunities[idx] = { ..._demo.opportunities[idx], ...updates };
  return _demo.opportunities[idx];
}

export async function deleteOpportunities(ids = []) {
  if (!ids.length) return [];
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('opportunities')
      .delete()
      .in('id', ids)
      .select('id');
    if (error) throw error;
    return data || [];
  }
  const deleted = [];
  _demo.opportunities = _demo.opportunities.filter(o => {
    if (ids.includes(o.id)) {
      deleted.push({ id: o.id });
      return false;
    }
    return true;
  });
  return deleted;
}

// ─── Sources ──────────────────────────────────────────────────────────────────

export async function listSources() {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('sources').select('*').order('name');
    if (error) throw error;
    return data;
  }
  return [..._demo.sources];
}

export async function upsertSource(source) {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('sources')
      .upsert(source, { onConflict: 'id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const idx = _demo.sources.findIndex(s => s.id === source.id);
  if (idx >= 0) {
    _demo.sources[idx] = { ..._demo.sources[idx], ...source };
    return _demo.sources[idx];
  }
  _demo.sources.push(source);
  return source;
}

// ─── Ingestion Logs ───────────────────────────────────────────────────────────

export async function logIngestion(log) {
  const sb = getSupabase();
  const record = {
    id: crypto.randomUUID(),
    run_at: new Date().toISOString(),
    ...log,
  };
  if (sb) {
    let { data, error } = await sb.from('ingestion_logs').insert(record).select().single();
    if (error) {
      // Graceful fallback: if count_high_review column does not exist yet (migration pending),
      // retry without that field so other logging is not disrupted.
      if (error.code === '42703' && 'count_high_review' in record) {
        const { count_high_review, ...safeRecord } = record;
        const result = await sb.from('ingestion_logs').insert(safeRecord).select().single();
        if (result.error) throw result.error;
        return result.data;
      }
      throw error;
    }
    return data;
  }
  _demo.ingestion_logs.unshift(record);
  return record;
}

export async function listIngestionLogs({ sourceId, limit = 50 } = {}) {
  const sb = getSupabase();
  if (sb) {
    let q = sb.from('ingestion_logs').select('*').order('run_at', { ascending: false }).limit(limit);
    if (sourceId) q = q.eq('source_id', sourceId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  let results = [..._demo.ingestion_logs];
  if (sourceId) results = results.filter(l => l.source_id === sourceId);
  return results.slice(0, limit);
}

// ─── Bulk Intake Helper ───────────────────────────────────────────────────────

/**
 * Process a batch of raw job objects through scoring + dedup, then persist.
 * Returns { inserted, deduped, errors }
 */
export async function processBatch(rawJobs, sourceId) {
  const existingHashes = await getExistingHashes();
  const existingOpportunityKeys = new Set(await getExistingOpportunityKeys());
  // Secondary dedup: source_family:source_job_id — catches re-runs even if title/content changes.
  const existingSourceJobIds = await getExistingSourceJobIds();
  const seenSourceJobIds = new Set(existingSourceJobIds);
  const inserted = [];
  const deduped = [];
  const errors = [];
  let high_review = 0;

  for (const raw of rawJobs) {
    try {
      // Secondary dedup: source_job_id takes precedence when available
      if (raw.source_job_id && raw.source_family) {
        const sjKey = `${raw.source_family}:${raw.source_job_id}`;
        if (seenSourceJobIds.has(sjKey)) {
          deduped.push({ ...raw, dedup_reason: 'source_job_id' });
          continue;
        }
      }

      const exactKey = opportunityExactKey(raw);
      if (existingOpportunityKeys.has(exactKey)) {
        deduped.push({ ...raw, dedup_reason: 'exact_match' });
        continue;
      }

      const hash = generateDedupHash({
        title: raw.title,
        company: raw.company,
        url: raw.url || raw.canonical_job_url || '',
      });
      if (existingHashes.includes(hash)) {
        deduped.push({ ...raw, dedup_reason: 'hash' });
        continue;
      }
      const scoring = scoreOpportunity(raw.title, raw.description, raw.seniority);
      if (!scoring.recommended) high_review++;
      const rec = {
        ...raw,
        source: sourceId,
        dedup_hash: hash,
        is_duplicate: false,
        lane: scoring.lane,
        fit_score: scoring.score,
        fit_signals: scoring.signals,
        recommended: scoring.recommended,
        high_fit: scoring.highFit,
        resume_emphasis: scoring.resumeEmphasis,
        recommendation_text: getRecommendation(scoring.lane, scoring.score),
      };
      const saved = await insertOpportunity(rec);
      inserted.push(saved);
      existingHashes.push(hash);
      existingOpportunityKeys.add(exactKey);
      if (raw.source_job_id && raw.source_family) {
        seenSourceJobIds.add(`${raw.source_family}:${raw.source_job_id}`);
      }
    } catch (err) {
      errors.push({ raw, error: err.message });
    }
  }

  return { inserted, deduped, errors, high_review };
}

// ─── User Preferences ─────────────────────────────────────────────────────────

/**
 * Retrieve a preference value by key.
 * Returns null if no preference is stored yet.
 * @param {string} profileKey - e.g. 'discovery_profile'
 */
export async function getPreference(profileKey) {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('user_preferences')
      .select('data')
      .eq('profile_key', profileKey)
      .maybeSingle();
    if (error) throw error;
    return data?.data ?? null;
  }
  return _demo.user_preferences[profileKey] ?? null;
}

/**
 * Save (upsert) a preference value by key.
 * @param {string} profileKey - e.g. 'discovery_profile'
 * @param {object} data - JSON-serialisable preference object
 */
export async function upsertPreference(profileKey, data) {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb
      .from('user_preferences')
      .upsert(
        { profile_key: profileKey, data, updated_at: new Date().toISOString() },
        { onConflict: 'profile_key' }
      );
    if (error) throw error;
    return { saved: true };
  }
  _demo.user_preferences[profileKey] = data;
  return { saved: true };
}

// ─── Readiness History ────────────────────────────────────────────────────────

/**
 * Insert a readiness history event.
 * Append-only. Used for status changes, approval changes, URL adds, pack regen.
 *
 * @param {string} opportunityId
 * @param {string} eventType - e.g. 'status_changed', 'approval_state_changed', 'apply_url_added', 'pack_regenerated', 'readiness_score_changed'
 * @param {object} payload   - arbitrary JSON payload describing the transition
 */
export async function insertReadinessHistory(opportunityId, eventType, payload = {}) {
  const sb = getSupabase();
  const record = {
    id: `rh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    opportunity_id: opportunityId,
    event_type: eventType,
    payload,
    recorded_at: new Date().toISOString(),
  };
  if (sb) {
    const { data, error } = await sb.from('readiness_history').insert(record).select().single();
    if (error) {
      // Non-fatal: log and continue — history is audit/reporting, not critical path
      console.warn('[db] insertReadinessHistory failed (non-fatal):', error.message);
      return null;
    }
    return data;
  }
  // Demo fallback: in-memory list (not persisted across restarts)
  if (!_demo.readiness_history) _demo.readiness_history = [];
  _demo.readiness_history.unshift(record);
  return record;
}

/**
 * List readiness history entries for one opportunity or all.
 *
 * @param {string|null} opportunityId - filter to specific opportunity, or null for all
 * @param {number} limit
 */
export async function listReadinessHistory(opportunityId = null, limit = 50) {
  const sb = getSupabase();
  if (sb) {
    let q = sb
      .from('readiness_history')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (opportunityId) q = q.eq('opportunity_id', opportunityId);
    const { data, error } = await q;
    if (error) {
      console.warn('[db] listReadinessHistory failed (non-fatal):', error.message);
      return [];
    }
    return data || [];
  }
  // Demo fallback
  const all = _demo.readiness_history || [];
  const filtered = opportunityId ? all.filter(e => e.opportunity_id === opportunityId) : all;
  return filtered.slice(0, limit);
}
