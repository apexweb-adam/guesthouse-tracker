/**
 * Netlify Function: /agent-health?candidate=<slug>
 *
 * GET → health of the local LinkedIn agent for a candidate, read from the
 * agent_health table (written by the agent on each sync).
 *
 * status: healthy | stale (no sync in 2h) | agent_stopped | cookies_expired | unknown
 */

import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const STALE_AFTER_SECONDS = 2 * 60 * 60;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export function deriveStatus(row, now = Date.now()) {
  if (!row) return { status: 'unknown', age_seconds: null };
  const age = row.last_sync_at ? Math.round((now - new Date(row.last_sync_at).getTime()) / 1000) : null;
  if (row.cookies_valid === false) return { status: 'cookies_expired', age_seconds: age };
  if (age === null || row.agent_running === false && age > STALE_AFTER_SECONDS) return { status: 'agent_stopped', age_seconds: age };
  if (age > STALE_AFTER_SECONDS) return { status: 'stale', age_seconds: age };
  return { status: 'healthy', age_seconds: age };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const candidate = event.queryStringParameters?.candidate || process.env.CANDIDATE_SLUG || 'candidate';
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(200, { candidate, status: 'unknown', notes: 'Database not configured.' });

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.from('agent_health').select('*').eq('candidate_slug', candidate).maybeSingle();
    if (error) throw error;
    const { candidate_slug, updated_at, ...rest } = data || {};
    return json(200, { candidate, ...rest, ...deriveStatus(data) });
  } catch (err) {
    return json(500, { candidate, status: 'unknown', error: err.message });
  }
};
