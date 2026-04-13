/**
 * Netlify Function: /intake
 *
 * Handles structured source intake (CSV batch, RSS, API).
 * Manual single-item intake is handled by /opportunities POST.
 *
 * POST { source, jobs: [{ title, company, location, url, description }] }
 *
 * Live intake (RSS/API) is blocked unless LIVE_INTAKE_ENABLED=true.
 * CSV and manual intake are always allowed.
 */

import { processBatch, logIngestion, isDemoMode } from './_shared/db.js';
import { isLiveIntakeEnabled, SOURCE_TYPES } from './_shared/sources.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const runAt = new Date().toISOString();

  try {
    const body = JSON.parse(event.body || '{}');
    const { source = 'src-manual', sourceType = SOURCE_TYPES.MANUAL, jobs = [] } = body;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return json(400, { error: 'jobs array is required and must not be empty' });
    }

    // Enforce live intake kill switch for non-manual, non-CSV sources
    const isLive = ![SOURCE_TYPES.MANUAL, SOURCE_TYPES.CSV, SOURCE_TYPES.DEMO].includes(sourceType);
    if (isLive && !isLiveIntakeEnabled()) {
      await logIngestion({
        source_id: source,
        count_discovered: jobs.length,
        count_deduped: 0,
        count_new: 0,
        errors: ['BLOCKED: live intake is disabled (LIVE_INTAKE_ENABLED != true)'],
        status: 'failure',
      });
      return json(403, {
        error: 'Live intake is currently disabled. Set LIVE_INTAKE_ENABLED=true to enable.',
        blocked: true,
      });
    }

    const { inserted, deduped, errors } = await processBatch(jobs, source);

    const logEntry = await logIngestion({
      source_id: source,
      count_discovered: jobs.length,
      count_deduped: deduped.length,
      count_new: inserted.length,
      errors: errors.map(e => e.error || String(e)),
      status: errors.length > 0 && inserted.length === 0 ? 'failure' : errors.length > 0 ? 'partial' : 'success',
    });

    return json(200, {
      summary: {
        discovered: jobs.length,
        new: inserted.length,
        deduped: deduped.length,
        errors: errors.length,
      },
      inserted: inserted.map(o => ({ id: o.id, title: o.title, fit_score: o.fit_score, lane: o.lane })),
      logId: logEntry.id,
      demo: isDemoMode(),
    });
  } catch (err) {
    console.error('[intake]', err);
    await logIngestion({
      source_id: 'unknown',
      count_discovered: 0,
      count_deduped: 0,
      count_new: 0,
      errors: [err.message],
      status: 'failure',
    }).catch(() => {});
    return json(500, { error: err.message });
  }
};
