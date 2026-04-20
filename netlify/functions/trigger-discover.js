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

  // Build a synthetic event that looks like a server-to-server call by
  // injecting the DISCOVERY_SECRET into the Authorization header.
  const secret = process.env.DISCOVERY_SECRET || '';
  const syntheticEvent = {
    ...event,
    httpMethod: 'POST',
    headers: {
      ...(event.headers || {}),
      authorization: `Bearer ${secret}`,
    },
  };

  return discoverHandler(syntheticEvent);
};
