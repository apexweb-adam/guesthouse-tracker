/**
 * Netlify Function: /logs
 *
 * GET → list ingestion logs (with optional source filter)
 */

import { listIngestionLogs, isDemoMode } from './_shared/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const { sourceId, limit = '50' } = event.queryStringParameters || {};
    const logs = await listIngestionLogs({ sourceId, limit: Number(limit) });
    return json(200, { logs, count: logs.length, demo: isDemoMode() });
  } catch (err) {
    console.error('[logs]', err);
    return json(500, { error: err.message });
  }
};
