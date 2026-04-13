/**
 * Netlify Function: /sources
 *
 * GET  → list all sources with health metrics
 * PATCH { id, enabled? } → toggle a source on/off
 */

import { listSources, upsertSource, listIngestionLogs, isDemoMode } from './_shared/db.js';
import { DEFAULT_SOURCES, mergeWithDefaults } from './_shared/sources.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      const dbSources = await listSources();
      const sources = mergeWithDefaults(dbSources);

      // Enrich with recent ingestion log summary per source
      const logs = await listIngestionLogs({ limit: 200 });

      const enriched = sources.map(s => {
        const sourceLogs = logs.filter(l => l.source_id === s.id);
        const lastLog = sourceLogs[0] || null;
        const totalImported = sourceLogs.reduce((n, l) => n + (l.count_new || 0), 0);
        const totalDeduped = sourceLogs.reduce((n, l) => n + (l.count_deduped || 0), 0);
        const totalFailures = sourceLogs.filter(l => l.status === 'failure').length;

        return {
          ...s,
          last_run: lastLog?.run_at || null,
          last_status: lastLog?.status || null,
          total_imported: totalImported,
          total_deduped: totalDeduped,
          total_failures: totalFailures,
          recent_log: lastLog,
        };
      });

      return json(200, {
        sources: enriched,
        liveIntakeEnabled: process.env.LIVE_INTAKE_ENABLED === 'true',
        demo: isDemoMode(),
      });
    }

    if (event.httpMethod === 'PATCH') {
      const { id, enabled } = JSON.parse(event.body || '{}');
      if (!id) return json(400, { error: 'id is required' });
      if (enabled === undefined) return json(400, { error: 'enabled is required' });

      const updated = await upsertSource({ id, enabled: Boolean(enabled) });
      return json(200, { source: updated });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[sources]', err);
    return json(500, { error: err.message });
  }
};
