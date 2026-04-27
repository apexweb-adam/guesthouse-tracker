/**
 * Netlify Function: /sync-apply-pack
 *
 * Receives fully generated apply-pack content from the local Python job agent.
 * The tracker remains review-only: this stores tailored resume/cover-letter
 * assets on the matching opportunity but never submits an application.
 */

import {
  listOpportunities,
  updateOpportunity,
  insertReadinessHistory,
} from './_shared/db.js';
import {
  generateApplyChecklist,
  suggestFollowUpDate,
  computePackReadinessScore,
  APPLY_PACK_SYSTEM_VERSION,
} from './_shared/applyPack.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

function normalizeText(s = '') {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'trk']
      .forEach(k => u.searchParams.delete(k));
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return normalizeText(url);
  }
}

function opportunityKey(opp = {}) {
  return [
    normalizeText(opp.title),
    normalizeText(opp.company),
    normalizeText(opp.location),
    normalizeUrl(opp.url || opp.canonical_job_url || opp.application_url || ''),
  ].join('|');
}

function payloadKey(body = {}) {
  return [
    normalizeText(body.title),
    normalizeText(body.company),
    normalizeText(body.location),
    normalizeUrl(body.url || body.application_url || ''),
  ].join('|');
}

function findMatchingOpportunity(opportunities, body) {
  if (body.opportunity_id) {
    const byId = opportunities.find(opp => opp.id === body.opportunity_id);
    if (byId) return byId;
  }

  const exact = payloadKey(body);
  const exactMatch = opportunities.find(opp => opportunityKey(opp) === exact);
  if (exactMatch) return exactMatch;

  const title = normalizeText(body.title);
  const company = normalizeText(body.company);
  const location = normalizeText(body.location);
  const sourceJobId = normalizeText(body.job_id || body.source_job_id);

  if (sourceJobId) {
    const bySourceJobId = opportunities.find(opp => normalizeText(opp.source_job_id) === sourceJobId);
    if (bySourceJobId) return bySourceJobId;
  }

  const candidates = opportunities.filter(opp =>
    normalizeText(opp.title) === title &&
    normalizeText(opp.company) === company
  );

  if (candidates.length === 1) return candidates[0];
  if (location) {
    const byLocation = candidates.find(opp => normalizeText(opp.location) === location);
    if (byLocation) return byLocation;
  }

  return null;
}

function listBlock(title, items = []) {
  const clean = (items || []).filter(Boolean);
  if (!clean.length) return '';
  return `${title}\n${clean.map(item => `- ${item}`).join('\n')}`;
}

function experienceBlock(experienceBullets = {}) {
  return Object.entries(experienceBullets || {})
    .map(([jobName, bullets]) => {
      const clean = (bullets || []).filter(Boolean);
      if (!clean.length) return '';
      return `${jobName}:\n${clean.map(item => `- ${item}`).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildResumeEmphasisBlock(resumeContent = {}, scoring = {}, resumePath = '') {
  const sections = [
    '[TAILORED RESUME CONTENT - review before submitting]',
    '',
  ];

  if (resumePath) sections.push(`Local DOCX: ${resumePath}`, '');

  const skills = resumeContent.core_skills || [];
  if (skills.length) sections.push(`Core skills to surface:\n${skills.join(' | ')}`, '');

  const achievements = listBlock('Key achievements', resumeContent.key_achievements);
  if (achievements) sections.push(achievements, '');

  const exp = experienceBlock(resumeContent.experience_bullets);
  if (exp) sections.push('Experience bullets', exp, '');

  const requirements = listBlock('Role requirements being targeted', scoring.key_requirements);
  if (requirements) sections.push(requirements, '');

  const gaps = listBlock('Gaps to review honestly', scoring.gaps);
  if (gaps) sections.push(gaps, '');

  return sections.join('\n').trim();
}

function buildApplyPack(body, opp) {
  const now = new Date().toISOString();
  const scoring = body.scoring || {};
  const resumeContent = body.resume_content || {};
  const coverLetterText = body.cover_letter_text || '';
  const resumeVersion = scoring.best_resume_variant || body.recommended_resume_version || 'general_pm';
  const keywords = resumeContent.keyword_tags || scoring.keywords_to_emphasise || [];
  const proofPoints = resumeContent.key_achievements || scoring.strengths || [];
  const resumePath = body.resume_path || '';
  const coverLetterPath = body.cover_letter_path || '';

  const pack = {
    opportunity_id: opp.id,
    pack_version: (opp.apply_pack?.pack_version || 0) + 1,
    generated_at: now,
    last_regenerated_at: now,
    generated_by_system_version: `${APPLY_PACK_SYSTEM_VERSION}+python-agent`,
    python_agent_generated: true,
    export_ready_flag: true,

    role_snapshot: {
      title: opp.title,
      company: opp.company,
      location: opp.location || null,
      lane: opp.lane,
      fit_score: body.score ?? scoring.score ?? opp.fit_score,
      fit_signals: opp.fit_signals || [],
      recommended: opp.recommended,
      resume_emphasis: opp.resume_emphasis,
    },

    recommended_resume_version: resumeVersion,
    recommendation_confidence: (body.score ?? scoring.score ?? 0) >= 75 ? 'high' : 'medium',
    recommendation_reason: scoring.reasoning || 'Generated by the local Python job agent after scoring this role.',
    resume_version_override: null,
    resume_version_override_reason: null,
    resume_version_override_at: null,
    original_system_recommendation: resumeVersion,

    keyword_mirror_list: keywords,
    proof_points_to_surface: proofPoints,
    summary_direction: resumeContent.summary || scoring.reasoning || '',
    bullet_emphasis_notes: Object.values(resumeContent.experience_bullets || {}).flat().slice(0, 8),
    recruiter_outreach_draft: '',
    hiring_manager_outreach_draft: '',

    copy_ready_summary_block: resumeContent.summary
      ? `[TAILORED RESUME SUMMARY - review before submitting]\n\n${resumeContent.summary}`
      : '',
    copy_ready_resume_emphasis_block: buildResumeEmphasisBlock(resumeContent, scoring, resumePath),
    copy_ready_cover_note_block: coverLetterText
      ? `[TAILORED COVER LETTER - review before submitting]\n\n${coverLetterText}`
      : '',

    python_generated_resume: {
      local_path: resumePath,
      filename: resumePath ? resumePath.split('/').pop() : '',
      content: resumeContent,
    },
    python_generated_cover_letter: {
      local_path: coverLetterPath,
      filename: coverLetterPath ? coverLetterPath.split('/').pop() : '',
      text: coverLetterText,
    },
    python_agent_scoring: scoring,
    apply_url_missing_at_generation: !(opp.application_url || opp.url || '').trim(),

    apply_checklist: generateApplyChecklist(opp, resumeVersion).map(item =>
      item.id === 'submit'
        ? { ...item, step: `Submit manually for ${opp.title} at ${opp.company || '[Company]'} after review` }
        : item
    ),
    suggested_follow_up_date: suggestFollowUpDate(body.score ?? scoring.score ?? opp.fit_score ?? 0),
    next_action: {
      action: 'Review the tailored resume and cover letter, then decide whether Candidate should apply manually.',
      priority: 'high',
    },
  };

  pack.pack_readiness_score = computePackReadinessScore(
    { ...opp, application_url: opp.application_url || opp.url || '' },
    pack
  );
  return pack;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.title || !body.company) {
      return json(400, { error: 'title and company are required' });
    }

    const opportunities = await listOpportunities();
    const opp = findMatchingOpportunity(opportunities, body);
    if (!opp) {
      return json(404, {
        error: 'Matching opportunity not found',
        key: payloadKey(body),
      });
    }

    const applyPack = buildApplyPack(body, opp);
    const updated = await updateOpportunity(opp.id, {
      apply_pack: applyPack,
      status: 'apply_pack_generated',
      fit_score: body.score ?? body.scoring?.score ?? opp.fit_score,
      notes: body.scoring?.reasoning || opp.notes,
      pack_readiness_score: applyPack.pack_readiness_score,
      application_url: opp.application_url || body.application_url || body.url || opp.url || null,
      last_action_date: new Date().toISOString(),
    });

    // Stamp python_agent_processed_at so this job is skipped on the next Python agent run.
    // Non-fatal: requires migration 005. Jobs already processed won't burn LLM API credits again.
    // The Python agent can query GET /opportunities?python_agent_pending=true for unprocessed jobs.
    await updateOpportunity(opp.id, {
      python_agent_processed_at: new Date().toISOString(),
    }).catch(() => {});

    await insertReadinessHistory(opp.id, 'pack_synced_from_python_agent', {
      pack_readiness_score: applyPack.pack_readiness_score,
      score: body.score ?? body.scoring?.score ?? null,
      local_resume_path: body.resume_path || null,
      local_cover_letter_path: body.cover_letter_path || null,
    });

    return json(200, {
      ok: true,
      opportunity_id: opp.id,
      status: updated.status,
      pack_readiness_score: applyPack.pack_readiness_score,
    });
  } catch (err) {
    console.error('[sync-apply-pack]', err);
    return json(500, { error: err.message });
  }
};
