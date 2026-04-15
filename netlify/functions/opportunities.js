/**
 * Netlify Function: /opportunities
 *
 * GET  → list opportunities (with optional filters)
 * POST → manual intake of a single opportunity
 * PATCH → update tracker fields (status, notes, next_action, etc.)
 */

import {
  listOpportunities,
  getOpportunity,
  processBatch,
  updateOpportunity,
  isDemoMode,
} from './_shared/db.js';
import { regenerateApplyPack, computePackReadinessScore } from './_shared/applyPack.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    // GET: list or get single
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      if (id) {
        const opp = await getOpportunity(id);
        if (!opp) return json(404, { error: 'Not found' });
        return json(200, opp);
      }
      const { status, lane, recommended } = event.queryStringParameters || {};
      const opps = await listOpportunities({
        status: status || undefined,
        lane: lane || undefined,
        recommended: recommended !== undefined ? recommended === 'true' : undefined,
      });
      return json(200, { opportunities: opps, count: opps.length, demo: isDemoMode() });
    }

    // POST: manual/single intake
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { title, company, location, url, description, source = 'src-manual' } = body;
      if (!title) return json(400, { error: 'title is required' });
      const { inserted, deduped, errors } = await processBatch(
        [{ title, company, location, url, description }],
        source
      );
      if (errors.length && !inserted.length) return json(400, { error: errors[0]?.error });
      if (deduped.length) return json(200, { duplicate: true, message: 'Opportunity already exists (deduplicated).' });
      return json(201, { opportunity: inserted[0], demo: isDemoMode() });
    }

    // PATCH: update an opportunity
    if (event.httpMethod === 'PATCH') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'id query param required' });
      const updates = JSON.parse(event.body || '{}');

      // Allowlist of patchable fields (approval gate preserved — use /approve for approval)
      const allowed = [
        'status', 'notes', 'next_action', 'next_action_due',
        'applied_date', 'last_action_date', 'tracking_url',
        'application_url', 'apply_pack_missing_url', 'pack_readiness_score',
      ];
      const safe = Object.fromEntries(
        Object.entries(updates).filter(([k]) => allowed.includes(k))
      );

      // When apply URL is added, advance status from needs_apply_url → apply_pack_generated
      if (updates.status_advance_from_needs_apply_url && safe.application_url) {
        const opp = await (await import('./_shared/db.js')).getOpportunity(id);
        if (opp && opp.status === 'needs_apply_url') {
          safe.status = 'apply_pack_generated';
          safe.apply_pack_missing_url = false;
          // If the pack was generated without an apply URL, regenerate it now with the URL available
          // Preserve override history, checklist progress, and audit trail
          if (opp.apply_pack && opp.apply_pack.apply_url_missing_at_generation) {
            try {
              const oppWithUrl = { ...opp, application_url: safe.application_url };
              const refreshedPack = regenerateApplyPack(oppWithUrl, opp.apply_pack, 'apply_url_added');
              safe.apply_pack = refreshedPack;
              safe.pack_readiness_score = refreshedPack.pack_readiness_score || 0;
            } catch (_e) {
              // Non-fatal: fall back to shallow URL patch
              safe.apply_pack = {
                ...opp.apply_pack,
                application_url: safe.application_url,
                apply_url_added_at: new Date().toISOString(),
                apply_url_missing_at_generation: false,
              };
            }
          } else if (opp.apply_pack) {
            safe.apply_pack = {
              ...opp.apply_pack,
              application_url: safe.application_url,
              apply_url_added_at: new Date().toISOString(),
            };
          }
        }
      }
      if (!Object.keys(safe).length) return json(400, { error: 'No valid fields to update' });

      const updated = await updateOpportunity(id, safe);
      return json(200, { opportunity: updated });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[opportunities]', err);
    return json(500, { error: err.message });
  }
};
