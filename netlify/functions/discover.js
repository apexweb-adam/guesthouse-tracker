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

export const handler = async (event) => {
  // Demo mode guard
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
