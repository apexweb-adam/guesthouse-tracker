/**
 * Netlify Function: /profile
 *
 * GET  → retrieve the persisted discovery profile (returns default if none saved)
 * POST → save / update the discovery profile
 *
 * Persistence model:
 * - Supabase `user_preferences` table with profile_key = 'discovery_profile'
 * - Falls back to in-memory store in demo mode
 *
 * The frontend should prefer this endpoint over localStorage in live mode.
 * localStorage may still be used as a fallback if the API is unavailable.
 */

import { getPreference, upsertPreference } from './_shared/db.js';
import { DEFAULT_DISCOVERY_PROFILE } from './_shared/sources.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const PROFILE_KEY = 'discovery_profile';

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      const stored = await getPreference(PROFILE_KEY);
      const profile = stored || DEFAULT_DISCOVERY_PROFILE;
      return json(200, { profile, source: stored ? 'persisted' : 'default' });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const profile = body.profile;
      if (!profile || typeof profile !== 'object') {
        return json(400, { error: 'Request body must include { profile: {...} }' });
      }

      // Validate expected shape (non-exhaustive — just guard critical fields)
      const required = ['includeTitleKeywords', 'excludeTitleKeywords', 'excludeDomainKeywords'];
      for (const field of required) {
        if (!Array.isArray(profile[field])) {
          return json(400, { error: `profile.${field} must be an array` });
        }
      }

      await upsertPreference(PROFILE_KEY, profile);
      return json(200, { saved: true, profile });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[profile]', err);
    return json(500, { error: err.message });
  }
};
