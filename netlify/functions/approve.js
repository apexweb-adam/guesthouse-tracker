/**
 * Netlify Function: /approve
 *
 * Approval gate — all human decisions go through here.
 * Preserves full audit trail: original recommendation, human decision, override reason.
 * On approval, automatically generates Apply Pack and transitions status to apply_pack_generated.
 *
 * POST { id, action: 'approve'|'reject'|'override', reason?, overrideFields? }
 */

import { getOpportunity, updateOpportunity } from './_shared/db.js';
import { generateApplyPack } from './_shared/applyPack.js';
import { fireEvent } from './_shared/prep.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

const VALID_ACTIONS = ['approve', 'reject', 'override'];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { id, action, reason = '', overrideFields = {} } = JSON.parse(event.body || '{}');

    if (!id) return json(400, { error: 'id is required' });
    if (!VALID_ACTIONS.includes(action)) {
      return json(400, { error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    const opp = await getOpportunity(id);
    if (!opp) return json(404, { error: 'Opportunity not found' });

    const now = new Date().toISOString();

    // Build the audit record — always preserved, never overwritten
    const humanOverride = {
      action,
      reason,
      decided_at: now,
      original_recommendation: opp.recommended,
      original_fit_score: opp.fit_score,
      original_lane: opp.lane,
    };

    let updates = {
      approval_state: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : opp.approval_state,
      human_override: humanOverride,
      last_action_date: now,
    };

    if (action === 'approve') {
      updates.status = 'approved';
      // After approval, the human may override resume emphasis
      if (overrideFields.resume_emphasis) {
        updates.resume_emphasis = overrideFields.resume_emphasis;
        humanOverride.resume_emphasis_override = overrideFields.resume_emphasis;
      }
      // Auto-generate Apply Pack immediately on approval
      try {
        const oppForPack = { ...opp, ...updates, approval_state: 'approved' };
        const applyPack = generateApplyPack(oppForPack);
        updates.apply_pack = applyPack;
        // If manual external role with no apply URL, flag it
        const hasApplyUrl = !!(opp.application_url || '').trim();
        if (opp.is_manual_external_intake && !hasApplyUrl) {
          updates.status = 'needs_apply_url';
          updates.apply_pack_missing_url = true;
        } else {
          updates.status = 'apply_pack_generated';
          updates.apply_pack_missing_url = false;
        }

        // Fire apply_pack_generated event
        await fireEvent('apply_pack_generated', {
          opportunity_id: id,
          title: opp.title,
          company: opp.company,
          lane: opp.lane,
          fit_score: opp.fit_score,
          resume_version: applyPack.recommended_resume_version,
          canonical_job_url: opp.canonical_job_url || null,
          timestamp: now,
        }).catch(() => {});

        // Fire strong_fit_ready_to_apply if fit score is high
        if ((opp.fit_score || 0) >= 75 && opp.recommended) {
          await fireEvent('strong_fit_ready_to_apply', {
            opportunity_id: id,
            title: opp.title,
            company: opp.company,
            lane: opp.lane,
            fit_score: opp.fit_score,
            canonical_job_url: opp.canonical_job_url || null,
            timestamp: now,
          }).catch(() => {});
        }
      } catch (packErr) {
        // Pack generation failure should not block approval
        console.warn('[approve] Apply Pack generation failed (non-fatal):', packErr.message);
      }
    }

    if (action === 'reject') {
      updates.status = 'rejected';
    }

    if (action === 'override') {
      // Human override of scoring/classification — allowed fields only
      const overrideable = ['lane', 'fit_score', 'resume_emphasis', 'recommended', 'notes'];
      const safeOverrides = Object.fromEntries(
        Object.entries(overrideFields).filter(([k]) => overrideable.includes(k))
      );
      updates = { ...updates, ...safeOverrides };
      humanOverride.overridden_fields = Object.keys(safeOverrides);
    }

    updates.human_override = humanOverride;

    const updated = await updateOpportunity(id, updates);
    return json(200, { opportunity: updated, audit: humanOverride });
  } catch (err) {
    console.error('[approve]', err);
    return json(500, { error: err.message });
  }
};
