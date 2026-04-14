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

import { isLiveIntakeEnabled, canSourceRunLive, DEFAULT_SOURCES, mergeWithDefaults } from './_shared/sources.js';
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

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  const { sourceId } = body;

  // Load sources
  let dbSources = [];
  try { dbSources = await listSources(); } catch {}
  const allSources = mergeWithDefaults(dbSources);

  // Filter to live-capable, enabled sources (optionally single source)
  const sourcesToRun = allSources.filter(s => {
    if (sourceId && s.id !== sourceId) return false;
    return canSourceRunLive(s);
  });

  if (sourcesToRun.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: sourceId
          ? `Source ${sourceId} is not enabled or not live-capable.`
          : 'No live-capable sources are currently enabled. Enable sources and set LIVE_INTAKE_ENABLED=true.',
        discovered: 0,
        ingested: 0,
        sources_run: 0,
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

  for (const source of sourcesToRun) {
    const sourceResult = {
      source_id: source.id,
      source_name: source.name,
      discovered: 0,
      ingested: 0,
      error: null,
    };

    try {
      const jobs = await discoverJobsForSource(source, config);
      sourceResult.discovered = jobs.length;
      totalDiscovered += jobs.length;

      if (jobs.length > 0) {
        // processBatch handles scoring, dedup, and DB write
        const ingestResult = await processBatch(jobs);
        const ingested = ingestResult?.new || ingestResult?.ingested || 0;
        sourceResult.ingested = ingested;
        totalIngested += ingested;
      }

      await logIngestion({
        source_id: source.id,
        source_name: source.name,
        records_fetched: jobs.length,
        new_records: sourceResult.ingested,
        duplicates: sourceResult.discovered - sourceResult.ingested,
        status: 'success',
      });
    } catch (err) {
      sourceResult.error = err.message;
      await logIngestion({
        source_id: source.id,
        source_name: source.name,
        records_fetched: 0,
        new_records: 0,
        status: 'error',
        error: err.message,
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

  // new_strong_fit — fire once if any newly ingested records scored as recommended
  // processBatch returns high_review but not yet the new strong-fit records;
  // we fire a summary event if any records were ingested (scoring inside processBatch
  // already ran — the consuming system can query the approval queue for details).
  if (totalIngested > 0) {
    await fireEvent('new_strong_fit', {
      context: 'discovery_run',
      new_records_ingested: totalIngested,
      message: `${totalIngested} new job(s) discovered and queued for approval review.`,
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
      results,
    }),
  };
};
