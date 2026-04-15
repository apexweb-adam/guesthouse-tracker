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
  _supabase = createClient(url, key);
  return _supabase;
}

export function isDemoMode() {
  return !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
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

export async function listOpportunities({ status, lane, recommended } = {}) {
  const sb = getSupabase();
  if (sb) {
    let q = sb.from('opportunities').select('*').order('ingested_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (lane) q = q.eq('lane', lane);
    if (recommended !== undefined) q = q.eq('recommended', recommended);
    const { data, error } = await q;
    if (error) throw error;
    return data;
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
  const inserted = [];
  const deduped = [];
  const errors = [];
  let high_review = 0;

  for (const raw of rawJobs) {
    try {
      const hash = generateDedupHash({
        title: raw.title,
        company: raw.company,
        url: raw.url || raw.canonical_job_url || '',
      });
      if (existingHashes.includes(hash)) {
        deduped.push(raw);
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
