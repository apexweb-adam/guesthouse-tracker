/**
 * Apply Pack Logic — _shared/applyPack.js
 *
 * Generates a structured Apply Pack for an approved opportunity.
 * Extends _shared/prep.js with resume recommendation, checklist,
 * follow-up date, bullet emphasis, pack versioning, and export readiness.
 *
 * Single source of truth rules:
 * - Scoring/classification: scoring.js
 * - Prep/outreach/proof-points: prep.js (imported here)
 * - Resume recommendation: scoring.js (recommendResumeVersion)
 * - Apply Pack assembly: this file
 *
 * Do NOT re-implement this logic in n8n, Zapier, the frontend, or elsewhere.
 */

import {
  LANES,
  LANE_CONFIG,
  RESUME_VERSIONS,
  RESUME_VERSION_LABELS,
  recommendResumeVersion,
} from './scoring.js';
import { generatePrepPackage } from './prep.js';

// ─── System version stamp ─────────────────────────────────────────────────────

export const APPLY_PACK_SYSTEM_VERSION = '2.0.0';

// ─── Checklist Generator ─────────────────────────────────────────────────────

/**
 * Generate the apply checklist for this opportunity.
 * Steps are ordered: resume tailoring → cover → outreach → submit → follow-up.
 */
export function generateApplyChecklist(opp, resumeVersion) {
  const laneLabel = LANE_CONFIG[opp.lane]?.label || opp.lane;
  return [
    {
      id: 'resume',
      step: `Tailor ${resumeVersion} — mirror keywords from keyword list below`,
      done: false,
    },
    {
      id: 'summary',
      step: 'Update resume summary using the summary direction below',
      done: false,
    },
    {
      id: 'bullets',
      step: 'Adjust bullet emphasis using the bullet emphasis notes below',
      done: false,
    },
    {
      id: 'proof_points',
      step: 'Weave in 2–3 proof points from the proof points list',
      done: false,
    },
    {
      id: 'review',
      step: `Review final resume for ${laneLabel} framing before submitting`,
      done: false,
    },
    {
      id: 'recruiter',
      step: 'Personalise and send recruiter outreach (use draft below)',
      done: false,
    },
    {
      id: 'submit',
      step: `Submit application for ${opp.title} at ${opp.company || '[Company]'}`,
      done: false,
    },
    {
      id: 'hm_outreach',
      step: 'Send hiring manager outreach after submitting (use draft below)',
      done: false,
    },
    {
      id: 'log',
      step: 'Mark as Applied in the tracker and set follow-up date',
      done: false,
    },
  ];
}

// ─── Follow-Up Date Suggestion ────────────────────────────────────────────────

/**
 * Suggest a follow-up date based on fit score.
 * High fit → follow up sooner.
 */
export function suggestFollowUpDate(fitScore) {
  const now = new Date();
  const daysAhead = fitScore >= 80 ? 7 : fitScore >= 60 ? 10 : 14;
  const followUp = new Date(now.getTime() + daysAhead * 86400000);
  return followUp.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Bullet Emphasis Notes ────────────────────────────────────────────────────

const BULLET_EMPHASIS = {
  [LANES.TPM]: [
    'Lead bullets with delivery outcome and technical scope, not job responsibility',
    'Include at least one SDLC ownership bullet (requirements → deployment)',
    'Show stakeholder span: engineering, product, ops, senior leadership',
    'Quantify: timelines compressed, team size, delivery cadence metrics',
    'Mention at least one technical blocker you resolved personally',
  ],
  [LANES.DELIVERY_MANAGER]: [
    'Lead with agile ceremony ownership: sprint planning, retros, standups, demos',
    'Show velocity improvement or delivery cadence metrics',
    'Include at least one team-level outcome (velocity, burndown, release frequency)',
    'Demonstrate SAFe, LeSS, or Scrum@Scale if applicable',
    'Avoid generic "managed projects" — prefer "drove delivery of [X] via [method]"',
  ],
  [LANES.OPS_MANAGER]: [
    'Emphasise readiness, compliance, and operational technical scope',
    'Show control frameworks: ITSM, ITIL, change management, incident response',
    'Quantify operational metrics: uptime, SLA adherence, incident reduction',
    'Demonstrate cross-team technical coordination, not just staff management',
    'Avoid bullets that look like general ops management — focus on technical-ops context',
  ],
  [LANES.PROGRAM_MANAGER]: [
    'Lead with governance: portfolio structure, programme board, PMO oversight',
    'Show cross-project dependency management at enterprise scale',
    'Include risk management, financial tracking, benefits realisation framing',
    'Demonstrate executive-level stakeholder management',
    'Avoid bullets that look like project manager — aim for programme/portfolio level',
  ],
  [LANES.GENERIC_PM]: [
    'If pursuing: emphasise highest-signal bullets from TPM or Delivery lane',
    'Do not lead with generic PM responsibilities — specificity is critical',
    'Only submit if seniority or salary justifies effort',
  ],
  [LANES.OTHER]: [
    'This role does not match target lanes. Review bullets carefully before submitting.',
  ],
};

// ─── Main Apply Pack Generator ────────────────────────────────────────────────

/**
 * Generate a full Apply Pack for an approved opportunity.
 * @param {object} opp - the opportunity record (must be approval_state='approved')
 * @returns {object} apply_pack
 */
export function generateApplyPack(opp) {
  if (opp.approval_state !== 'approved') {
    throw new Error(`Cannot generate Apply Pack: opportunity ${opp.id} is not approved (state: ${opp.approval_state})`);
  }

  const now = new Date().toISOString();

  // Resume recommendation
  const resumeRec = recommendResumeVersion(opp.lane, opp.fit_score, opp.fit_signals || []);

  // Checklist
  const applyChecklist = generateApplyChecklist(opp, resumeRec.version);

  // Follow-up date
  const suggestedFollowUpDate = suggestFollowUpDate(opp.fit_score);

  // Bullet emphasis
  const bulletEmphasisNotes = BULLET_EMPHASIS[opp.lane] || BULLET_EMPHASIS[LANES.OTHER];

  // Generate core prep (keywords, proof points, summary direction, outreach)
  const prep = generatePrepPackage(opp);

  return {
    // Metadata
    opportunity_id: opp.id,
    pack_version: 1,
    generated_at: now,
    last_regenerated_at: now,
    generated_by_system_version: APPLY_PACK_SYSTEM_VERSION,
    export_ready_flag: true,

    // Role snapshot (frozen at generation time)
    role_snapshot: {
      title: opp.title,
      company: opp.company,
      location: opp.location || null,
      lane: opp.lane,
      fit_score: opp.fit_score,
      fit_signals: opp.fit_signals || [],
      recommended: opp.recommended,
      resume_emphasis: opp.resume_emphasis,
    },

    // Resume recommendation (system-generated — never overwrite original)
    recommended_resume_version: resumeRec.version,
    recommendation_confidence: resumeRec.confidence,
    recommendation_reason: resumeRec.reason,

    // Override tracking (null until human overrides)
    resume_version_override: null,
    resume_version_override_reason: null,
    resume_version_override_at: null,
    original_system_recommendation: resumeRec.version,

    // Content
    keyword_mirror_list: prep.keywordMirrorList,
    proof_points_to_surface: prep.proofPointsToSurface,
    summary_direction: prep.summaryDirection,
    bullet_emphasis_notes: bulletEmphasisNotes,
    recruiter_outreach_draft: prep.outreach.recruiterDraft,
    hiring_manager_outreach_draft: prep.outreach.hiringManagerDraft,

    // Workflow
    apply_checklist: applyChecklist,
    suggested_follow_up_date: suggestedFollowUpDate,
    next_action: prep.nextAction,
  };
}

/**
 * Apply a human override to resume version.
 * Preserves original system recommendation.
 */
export function applyResumeOverride(existingPack, overrideVersion, overrideReason = '') {
  if (!RESUME_VERSION_LABELS[overrideVersion]) {
    throw new Error(`Invalid resume version: ${overrideVersion}. Valid: ${Object.keys(RESUME_VERSION_LABELS).join(', ')}`);
  }
  return {
    ...existingPack,
    resume_version_override: overrideVersion,
    resume_version_override_reason: overrideReason,
    resume_version_override_at: new Date().toISOString(),
    // original_system_recommendation is NEVER overwritten
  };
}

/**
 * Get the active (effective) resume version — override if present, else system recommendation.
 */
export function getEffectiveResumeVersion(pack) {
  return pack?.resume_version_override || pack?.recommended_resume_version || RESUME_VERSIONS.MASTER;
}

/**
 * Regenerate an Apply Pack, preserving override history.
 */
export function regenerateApplyPack(opp, existingPack) {
  const fresh = generateApplyPack(opp);
  return {
    ...fresh,
    pack_version: (existingPack?.pack_version || 1) + 1,
    last_regenerated_at: new Date().toISOString(),
    // Preserve override if one was set
    resume_version_override: existingPack?.resume_version_override || null,
    resume_version_override_reason: existingPack?.resume_version_override_reason || null,
    resume_version_override_at: existingPack?.resume_version_override_at || null,
    // original_system_recommendation is the NEW generation's recommendation
    original_system_recommendation: fresh.recommended_resume_version,
    // Preserve checklist done-state from previous pack
    apply_checklist: fresh.apply_checklist.map(item => {
      const prev = existingPack?.apply_checklist?.find(p => p.id === item.id);
      return prev ? { ...item, done: prev.done } : item;
    }),
  };
}
