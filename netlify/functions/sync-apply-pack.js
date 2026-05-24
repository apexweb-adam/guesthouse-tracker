/**
 * Netlify Function: /sync-apply-pack
 *
 * Receives finished resume/cover-letter assets from the Python agent and
 * stores them on the matching tracker opportunity.
 */

import { listOpportunities, updateOpportunity, isDemoMode } from './_shared/db.js';
import { generateApplyPack, computePackReadinessScore } from './_shared/applyPack.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

function normText(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normUrl(value = '') {
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return normText(value);
  }
}

function matches(body, opp) {
  if (body.opportunity_id && body.opportunity_id === opp.id) return true;
  if (body.job_id && body.job_id === opp.source_job_id) return true;
  if (normText(body.title) !== normText(opp.title)) return false;
  if (normText(body.company) !== normText(opp.company)) return false;
  const bodyUrl = body.application_url || body.url || '';
  const oppUrl = opp.application_url || opp.canonical_job_url || opp.url || '';
  if (bodyUrl && oppUrl) return normUrl(bodyUrl) === normUrl(oppUrl);
  return normText(body.location) === normText(opp.location);
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.title || !body.company) return json(400, { error: 'title and company are required' });

    const opportunities = await listOpportunities();
    const opp = opportunities.find(o => matches(body, o));
    if (!opp) return json(404, { error: 'No matching opportunity found' });

    const applicationUrl = body.application_url || body.url || opp.application_url || opp.canonical_job_url || opp.url || '';
    const approvedOpp = { ...opp, approval_state: 'approved', application_url: applicationUrl };
    const basePack = opp.apply_pack || generateApplyPack(approvedOpp);
    const now = new Date().toISOString();
    const applyPack = {
      ...basePack,
      generated_at: basePack.generated_at || now,
      last_regenerated_at: now,
      python_agent_synced_at: now,
      source_resume_docx_path: body.resume_path || basePack.source_resume_docx_path || null,
      source_cover_letter_docx_path: body.cover_letter_path || basePack.source_cover_letter_docx_path || null,
      tailored_resume_content: body.resume_content || basePack.tailored_resume_content || null,
      cover_letter_text: body.cover_letter_text || basePack.cover_letter_text || '',
      copy_ready_tailored_resume_block:
        body.resume_content?.full_text ||
        body.resume_content?.resume_text ||
        basePack.copy_ready_tailored_resume_block,
      copy_ready_cover_letter_block:
        body.cover_letter_text ||
        basePack.copy_ready_cover_letter_block ||
        basePack.copy_ready_cover_note_block,
      apply_url_missing_at_generation: !applicationUrl,
    };
    applyPack.pack_readiness_score = computePackReadinessScore(approvedOpp, applyPack);

    const updated = await updateOpportunity(opp.id, {
      approval_state: 'approved',
      status: applicationUrl ? 'apply_pack_generated' : 'needs_apply_url',
      application_url: applicationUrl || opp.application_url || null,
      apply_pack: applyPack,
      pack_readiness_score: applyPack.pack_readiness_score,
      apply_pack_missing_url: !applicationUrl,
      last_action_date: now,
    });

    return json(200, {
      ok: true,
      id: updated.id,
      status: updated.status,
      pack_readiness_score: applyPack.pack_readiness_score,
      demo: isDemoMode(),
    });
  } catch (err) {
    console.error('[sync-apply-pack]', err);
    return json(500, { error: err.message });
  }
};
