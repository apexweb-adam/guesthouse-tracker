/**
 * Netlify Function: discover
 *
 * POST /discover — Trigger a job discovery run for one or all live sources.
 *
 * This function orchestrates job discovery from governed structured sources
 * (Greenhouse, Lever, USAJobs, RSS/Atom) and feeds discovered jobs into the
 * existing intake pipeline (scoring, dedup, approval queue).
 *
 * Safety controls:
 *   - LIVE_INTAKE_ENABLED must be "true" (global kill switch)
 *   - Per-source enabled flag must be true
 *   - Source must be liveCapable: true
 *   - Demo records are never created by this function
 *
 * Body params (optional):
 *   { sourceId }   — run a single source; omit to run all enabled live sources
 *
 * Environment variables required per source family:
 *   Greenhouse:  GREENHOUSE_BOARDS (comma-separated board tokens)
 *   Lever:       LEVER_BOARDS (comma-separated company slugs)
 *   USAJobs:     USAJOBS_API_KEY, USAJOBS_USER_AGENT
 *   (RSS/Atom:   url configured in DEFAULT_SOURCES / DB)
 */

import { isLiveIntakeEnabled, canSourceRunLive, DEFAULT_SOURCES, mergeWithDefaults, filterSourcesByFamily } from './_shared/sources.js';
import { discoverJobsForSource, normaliseJob } from './_shared/jobFinder.js';
import { DEFAULT_DISCOVERY_PROFILE } from './_shared/sources.js';
import { listSources, processBatch, logIngestion, isDemoMode } from './_shared/db.js';
import { fireEvent } from './_shared/prep.js';

/**
 * Verify the DISCOVERY_SECRET header.
 * In demo mode the secret check is skipped (no real sources run anyway).
 *
 * Callers (n8n, cron, CI) must send:
 *   Authorization: Bearer <DISCOVERY_SECRET>
 * OR
 *   X-Discovery-Secret: <DISCOVERY_SECRET>
 */
function isAuthorized(event) {
  const secret = process.env.DISCOVERY_SECRET;
  // If no secret is configured the endpoint is considered restricted — reject all.
  // (Set DISCOVERY_SECRET=your-secret in your Netlify env before enabling.)
  if (!secret) return false;
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const secretHeader = event.headers?.['x-discovery-secret'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() === secret;
  }
  return secretHeader === secret;
}

/**
 * Core discovery logic — runs without an auth check.
 * Called by handler (after auth) and by trigger-discover (server-side proxy).
 *
 * @param {object} body - Already-parsed request body: { sourceId?, sourceFamily? }
 */
export async function runDiscovery(body = {}) {
  // Global kill switch
  if (!isLiveIntakeEnabled()) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: 'Live intake is disabled. Set LIVE_INTAKE_ENABLED=true to enable real job discovery.',
        discovered: 0,
        ingested: 0,
      }),
    };
  }

  const { sourceId, sourceFamily } = body;

  // Load sources
  let dbSources = [];
  try { dbSources = await listSources(); } catch (dbErr) {
    // Non-fatal: fall back to DEFAULT_SOURCES. Log so the operator can see DB connectivity issues.
    console.warn('[discover] listSources() failed — running with DEFAULT_SOURCES only:', dbErr.message);
  }
  const allSources = mergeWithDefaults(dbSources);

  // Filter to live-capable, enabled sources (optionally by single source or source family)
  let sourcesToRun = allSources.filter(s => {
    if (sourceId && s.id !== sourceId) return false;
    return canSourceRunLive(s);
  });

  if (sourceFamily) {
    sourcesToRun = filterSourcesByFamily(sourcesToRun, sourceFamily);
  }

  if (sourcesToRun.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: sourceId
          ? `Source ${sourceId} is not enabled or not live-capable.`
          : sourceFamily
            ? `No live-capable sources found for source family: ${sourceFamily}.`
            : 'No live-capable sources are currently enabled. Enable sources and set LIVE_INTAKE_ENABLED=true.',
        discovered: 0,
        ingested: 0,
        sources_run: 0,
        filter_source_family: sourceFamily || null,
      }),
    };
  }

  // Resolve config from env vars
  const greenhouseBoards = (process.env.GREENHOUSE_BOARDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const leverBoards = (process.env.LEVER_BOARDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const usajobsKeyword = process.env.USAJOBS_KEYWORD || 'technical project manager';

  const config = {
    greenhouseBoards,
    leverBoards,
    usajobsKeyword,
    maxResults: parseInt(process.env.MAX_RECORDS_PER_RUN || '50', 10),
    discoveryProfile: DEFAULT_DISCOVERY_PROFILE,
  };

  const results = [];
  let totalDiscovered = 0;
  let totalIngested = 0;
  let totalRecommended = 0; // count of ingested records with recommended=true (score >= 70)

  for (const source of sourcesToRun) {
    const sourceResult = {
      source_id: source.id,
      source_name: source.name,
      discovered: 0,
      ingested: 0,
      error: null,
    };

    try {
      // Pre-validate source config so misconfigurations fail loudly
      if (source.sourceFamily === 'greenhouse' && greenhouseBoards.length === 0) {
        throw new Error('GREENHOUSE_BOARDS env var is empty — set at least one board token (e.g. GREENHOUSE_BOARDS=atlassian,servicenow)');
      }
      if (source.sourceFamily === 'lever' && leverBoards.length === 0) {
        throw new Error('LEVER_BOARDS env var is empty — set at least one company slug (e.g. LEVER_BOARDS=atlassian,canva)');
      }
      if (source.sourceFamily === 'usajobs' && (!process.env.USAJOBS_API_KEY || !process.env.USAJOBS_USER_AGENT)) {
        throw new Error('USAJOBS_API_KEY and USAJOBS_USER_AGENT env vars are required for USAJobs source');
      }

      const jobs = await discoverJobsForSource(source, config);
      sourceResult.discovered = jobs.length;
      totalDiscovered += jobs.length;

      if (jobs.length > 0) {
        // processBatch handles scoring, dedup, and DB write
        const ingestResult = await processBatch(jobs, source.id);
        const { inserted = [], deduped = [], errors: batchErrors = [], high_review = 0 } = ingestResult || {};
        const ingested = inserted.length;
        const deduped_count = deduped.length;

        sourceResult.ingested = ingested;
        sourceResult.deduped = deduped_count;
        sourceResult.high_review = high_review;
        // Count recommended records (score >= 70) — used for new_strong_fit event
        sourceResult.recommended = ingested - high_review;
        totalIngested += ingested;
        totalRecommended += Math.max(0, sourceResult.recommended);

        await logIngestion({
          source_id: source.id,
          count_discovered: jobs.length,
          count_new: ingested,
          count_deduped: deduped_count,
          count_high_review: high_review,
          errors: batchErrors.map(e => e.error || String(e)),
          status: batchErrors.length > 0 && ingested === 0 ? 'partial' : 'success',
        });
      } else {
        await logIngestion({
          source_id: source.id,
          count_discovered: 0,
          count_new: 0,
          count_deduped: 0,
          count_high_review: 0,
          errors: [],
          status: 'success',
        });
      }
    } catch (err) {
      sourceResult.error = err.message;
      await logIngestion({
        source_id: source.id,
        count_discovered: 0,
        count_new: 0,
        count_deduped: 0,
        count_high_review: 0,
        errors: [err.message],
        status: 'error',
      }).catch(() => {});
    }

    results.push(sourceResult);
  }

  // ── Fire events ─────────────────────────────────────────────────────────────

  // discovery_run_complete — always fire when any sources ran
  await fireEvent('discovery_run_complete', {
    sources_run: sourcesToRun.length,
    total_discovered: totalDiscovered,
    total_ingested: totalIngested,
    results,
    timestamp: new Date().toISOString(),
  }).catch(() => {});

  // new_strong_fit — fire only when newly ingested records scored as recommended (score >= 70).
  // Firing for every ingested record would generate noise from low-fit Ops/generic roles.
  if (totalRecommended > 0) {
    await fireEvent('new_strong_fit', {
      context: 'discovery_run',
      new_records_ingested: totalIngested,
      new_strong_fit_count: totalRecommended,
      message: `${totalRecommended} strong-fit job(s) discovered and queued for approval review.`,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      mode: 'live',
      sources_run: sourcesToRun.length,
      total_discovered: totalDiscovered,
      total_ingested: totalIngested,
      total_recommended: totalRecommended,
      filter_source_family: sourceFamily || null,
      results,
    }),
  };
}

/**
 * HTTP handler — enforces auth before delegating to runDiscovery.
 * External callers (n8n, cron, CI) must supply the DISCOVERY_SECRET.
 * Browser callers should use /trigger-discover instead.
 */
export const handler = async (event) => {
  // Demo mode guard — secret not required in demo (nothing real runs)
  if (isDemoMode()) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        mode: 'demo',
        message: 'Discovery skipped in demo mode. Real job discovery requires LIVE_INTAKE_ENABLED=true and real source configuration.',
        discovered: 0,
        ingested: 0,
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST required' }) };
  }

  // Auth check — reject unauthorized callers
  if (!isAuthorized(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unauthorized. Set DISCOVERY_SECRET and send it as: Authorization: Bearer <secret> or X-Discovery-Secret: <secret>',
      }),
    };
  }

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  return runDiscovery(body);
};
