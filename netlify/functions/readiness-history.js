/**
 * /.netlify/functions/readiness-history
 *
 * GET  ?id=<opportunity_id>&limit=<n>  — list history for one opportunity (or all if no id)
 * POST { opportunity_id, event_type, payload }  — write a history event (client→server path)
 *
 * Used by the OpportunityDetail timeline in production mode.
 * In demo/localStorage mode the frontend uses getReadinessHistory() directly.
 */

import { listReadinessHistory, insertReadinessHistory } from './_shared/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    // GET: list readiness history
    if (event.httpMethod === 'GET') {
      const { id, limit } = event.queryStringParameters || {};
      const limitN = Math.min(parseInt(limit || '50', 10) || 50, 200);
      const entries = await listReadinessHistory(id || null, limitN);
      return json(200, { entries, count: entries.length });
    }

    // POST: write a readiness history event (client-side live mode)
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { opportunity_id, event_type, payload } = body;
      if (!opportunity_id) return json(400, { error: 'opportunity_id required' });
      if (!event_type) return json(400, { error: 'event_type required' });
      const entry = await insertReadinessHistory(opportunity_id, event_type, payload || {});
      return json(201, { entry });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[readiness-history]', err);
    return json(500, { error: err.message });
  }
};
