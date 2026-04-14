/**
 * Netlify Function: /apply-pack
 *
 * GET  ?id=<id>                          → return the Apply Pack for an opportunity
 * POST { id, action, ... }               → actions on the pack:
 *   action=regenerate                    → regenerate the pack (preserves override history)
 *   action=override_resume               → apply a human resume version override
 *     { overrideVersion, overrideReason }
 *   action=update_checklist              → mark checklist item done/undone
 *     { itemId, done }
 *   action=update_status                 → update apply workflow status
 *     { status }
 *
 * Apply Pack is stored on the opportunity record as `apply_pack`.
 */

import { getOpportunity, updateOpportunity } from './_shared/db.js';
import {
  generateApplyPack,
  applyResumeOverride,
  regenerateApplyPack,
} from './_shared/applyPack.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

const VALID_APPLY_STATUSES = [
  'approved',
  'apply_pack_generated',
  'ready_to_apply',
  'applied',
  'follow_up_1',
  'follow_up_2',
  'interviewing',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'id is required' });

    try {
      const opp = await getOpportunity(id);
      if (!opp) return json(404, { error: 'Opportunity not found' });

      // If pack exists and is approved, return it
      if (opp.apply_pack) return json(200, { apply_pack: opp.apply_pack, opportunity: opp });

      // Auto-generate if approved but pack not yet created
      if (opp.approval_state === 'approved') {
        const pack = generateApplyPack(opp);
        const updated = await updateOpportunity(id, {
          apply_pack: pack,
          status: 'apply_pack_generated',
        });
        return json(200, { apply_pack: pack, opportunity: updated, generated: true });
      }

      return json(400, { error: 'Apply Pack requires approval_state=approved. Approve the opportunity first.' });
    } catch (err) {
      console.error('[apply-pack GET]', err);
      return json(500, { error: err.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { id, action } = body;

      if (!id) return json(400, { error: 'id is required' });
      if (!action) return json(400, { error: 'action is required' });

      const opp = await getOpportunity(id);
      if (!opp) return json(404, { error: 'Opportunity not found' });

      if (action === 'regenerate') {
        if (opp.approval_state !== 'approved') {
          return json(400, { error: 'Cannot regenerate Apply Pack: opportunity is not approved' });
        }
        const fresh = regenerateApplyPack(opp, opp.apply_pack);
        const updated = await updateOpportunity(id, {
          apply_pack: fresh,
          status: opp.status === 'approved' ? 'apply_pack_generated' : opp.status,
        });
        return json(200, { apply_pack: fresh, opportunity: updated });
      }

      if (action === 'override_resume') {
        const { overrideVersion, overrideReason = '' } = body;
        if (!overrideVersion) return json(400, { error: 'overrideVersion is required' });
        if (!opp.apply_pack) return json(400, { error: 'No Apply Pack exists yet. Generate one first.' });
        const updated_pack = applyResumeOverride(opp.apply_pack, overrideVersion, overrideReason);
        const updated = await updateOpportunity(id, { apply_pack: updated_pack });
        return json(200, { apply_pack: updated_pack, opportunity: updated });
      }

      if (action === 'update_checklist') {
        const { itemId, done } = body;
        if (!itemId) return json(400, { error: 'itemId is required' });
        if (!opp.apply_pack) return json(400, { error: 'No Apply Pack exists yet.' });
        const updated_pack = {
          ...opp.apply_pack,
          apply_checklist: opp.apply_pack.apply_checklist.map(item =>
            item.id === itemId ? { ...item, done: !!done } : item
          ),
        };
        const updated = await updateOpportunity(id, { apply_pack: updated_pack });
        return json(200, { apply_pack: updated_pack, opportunity: updated });
      }

      if (action === 'update_status') {
        const { status } = body;
        if (!status) return json(400, { error: 'status is required' });
        if (!VALID_APPLY_STATUSES.includes(status)) {
          return json(400, { error: `Invalid status. Valid: ${VALID_APPLY_STATUSES.join(', ')}` });
        }
        const statusUpdates = {
          status,
          last_action_date: new Date().toISOString(),
        };
        if (status === 'applied') statusUpdates.applied_date = new Date().toISOString();
        const updated = await updateOpportunity(id, statusUpdates);
        return json(200, { opportunity: updated });
      }

      return json(400, { error: `Unknown action: ${action}` });
    } catch (err) {
      console.error('[apply-pack POST]', err);
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
