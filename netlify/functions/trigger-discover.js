/**
 * Netlify Function: trigger-discover
 *
 * Browser-callable proxy for the discovery flow.
 *
 * Problem this solves:
 *   POST /discover requires Authorization: Bearer <DISCOVERY_SECRET>.
 *   That secret must never be exposed to the browser.  This function is the
 *   safe bridge: the browser calls it (no secret required from the caller),
 *   and it invokes runDiscovery() server-side directly — no HTTP hop, no
 *   need to pass or transmit the secret at all.
 *
 * Body params (optional, forwarded as-is):
 *   { sourceId }        — run a single source
 *   { sourceFamily }    — run all sources in a family (greenhouse|lever|usajobs|rss)
 *
 * Returns: the same JSON shape as /discover.
 */

import { runDiscovery } from './discover.js';
import { isDemoMode } from './_shared/db.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'POST required' }),
    };
  }

  // Demo mode guard — mirror discover.js demo response so callers get a consistent shape.
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

  // Parse body once here, then hand off to the shared core logic.
  // runDiscovery() contains the kill-switch check, source loading, and all business logic.
  // Auth is NOT required here — this function itself is the auth boundary for browser callers.
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  return runDiscovery(body);
};
