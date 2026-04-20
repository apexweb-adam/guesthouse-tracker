/**
 * Netlify Function: trigger-discover
 *
 * Browser-callable proxy for POST /discover.
 *
 * Problem this solves:
 *   The /discover endpoint requires Authorization: Bearer <DISCOVERY_SECRET>.
 *   That secret must never be exposed to the browser.  This function is the
 *   safe bridge: the browser calls it (no secret required from the caller),
 *   and it forwards the request to the discover handler server-side, injecting
 *   the DISCOVERY_SECRET from process.env.
 *
 * Body params (optional, forwarded as-is):
 *   { sourceId }        — run a single source
 *   { sourceFamily }    — run all sources in a family (greenhouse|lever|usajobs|rss)
 *
 * Returns: the same JSON shape as /discover.
 */

import { handler as discoverHandler } from './discover.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'POST required' }),
    };
  }

  // Build a synthetic event with only safe, known-good headers.
  // Do NOT spread event.headers — it could allow header-injection attacks where
  // a browser caller crafts an Authorization header and bypasses the secret logic.
  const secret = process.env.DISCOVERY_SECRET || '';
  const syntheticEvent = {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: event.body || '{}',
  };

  return discoverHandler(syntheticEvent);
};
