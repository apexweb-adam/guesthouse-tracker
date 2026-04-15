/**
 * Netlify Function: /prep
 *
 * GET ?id=<opportunity_id>
 *
 * Returns a preparation package for an opportunity:
 *   - keyword mirror list
 *   - resume emphasis recommendation
 *   - proof points to surface
 *   - summary direction
 *   - recruiter outreach draft
 *   - hiring manager outreach draft
 *   - next action recommendation
 *
 * Does NOT auto-submit or auto-send anything.
 */

import { getOpportunity } from './_shared/db.js';
import { generatePrepPackage } from './_shared/prep.js';

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
    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'id query parameter is required' });

    const opp = await getOpportunity(id);
    if (!opp) return json(404, { error: 'Opportunity not found' });

    const prepPackage = generatePrepPackage(opp);
    return json(200, { prep: prepPackage });
  } catch (err) {
    console.error('[prep]', err);
    return json(500, { error: err.message });
  }
};
