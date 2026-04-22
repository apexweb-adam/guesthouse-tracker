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
 * - Resume recommendation: scoring.js (recommendResumeVersion) + resumeVault.js
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
import {
  INITIAL_VAULT,
  recommendVaultResume,
  getVaultQualityGates,
} from './resumeVault.js';

// ─── System version stamp ─────────────────────────────────────────────────────

export const APPLY_PACK_SYSTEM_VERSION = '5.0.0';

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

// ─── Copy-Ready Content Generators ───────────────────────────────────────────

/**
 * Generate a copy-ready resume summary block.
 *
 * This is a draft-ready paragraph aligned to the specific lane and role.
 * It is intended to be copied, reviewed, and personalised before use.
 * It is NOT a finished, final-truth statement — always review before submitting.
 *
 * @param {object} opp - opportunity record
 * @param {string[]} topKeywords - top keywords from JD
 * @returns {string} copy-ready summary draft
 */
export function generateCopyReadySummaryBlock(opp, topKeywords = []) {
  const laneConfig = LANE_CONFIG[opp.lane] || LANE_CONFIG[LANES.OTHER];
  const laneLabel = laneConfig.label;
  const company = opp.company || '[Company]';
  const title = opp.title || '[Role Title]';
  const kwSnippet = topKeywords.slice(0, 4).join(', ') || 'technical delivery, stakeholder management';

  const SUMMARIES = {
    [LANES.TPM]: `Technical Project Manager and delivery leader with [X]+ years of experience owning end-to-end SDLC for complex technical programmes. Proven track record of bridging engineering, product, and business stakeholders to deliver scalable platforms on time and within scope. Brings hands-on ${kwSnippet} expertise. Immediately interested in the ${title} role at ${company}.`,
    [LANES.DELIVERY_MANAGER]: `Delivery Manager with [X]+ years of Agile and SAFe delivery leadership across cross-functional squads. Experienced in sprint planning, release management, and continuous improvement frameworks. Brings strong ${kwSnippet} background. Interested in applying this experience to the ${title} role at ${company}.`,
    [LANES.OPS_MANAGER]: `Technical Operations Manager with [X]+ years of experience governing ITSM, compliance, and operational readiness programmes in complex technical environments. Track record of maintaining service stability and driving audit-readiness. Brings ${kwSnippet} expertise to the ${title} role at ${company}.`,
    [LANES.PROGRAM_MANAGER]: `Programme Manager and governance leader with [X]+ years of managing enterprise-scale programmes across multiple workstreams. Experienced in PMO governance, portfolio risk management, and executive stakeholder reporting. Brings ${kwSnippet} background to the ${title} role at ${company}.`,
    [LANES.GENERIC_PM]: `Project Manager with a cross-functional delivery background and experience in ${kwSnippet}. Interested in the ${title} role at ${company}. Note: Review lane fit before applying.`,
    [LANES.OTHER]: `Experienced professional with background in ${kwSnippet}. Interested in the ${title} role at ${company}. Note: Role fit is outside primary target lanes — review carefully.`,
  };

  const draft = SUMMARIES[opp.lane] || SUMMARIES[LANES.OTHER];
  return `[DRAFT — review and personalise before use]\n\n${draft}`;
}

/**
 * Generate a copy-ready resume emphasis block.
 *
 * This is a formatted list of specific lead-with themes and proof points,
 * intended to be copied into notes or an editing workflow.
 * It is NOT fabricated claims — it is direction for which real experience to surface.
 *
 * @param {object} opp - opportunity record
 * @param {string[]} bulletEmphasisNotes - the lane-specific bullet emphasis notes
 * @param {string[]} proofPoints - selected proof points
 * @returns {string} copy-ready emphasis block
 */
export function generateCopyReadyResumeEmphasisBlock(opp, bulletEmphasisNotes = [], proofPoints = []) {
  const laneConfig = LANE_CONFIG[opp.lane] || LANE_CONFIG[LANES.OTHER];
  const laneLabel = laneConfig.label;

  const emphasisLines = bulletEmphasisNotes.slice(0, 5).map((note, i) => `  ${i + 1}. ${note}`).join('\n');
  const proofLines = proofPoints.slice(0, 4).map((pp, i) => `  ${String.fromCharCode(65 + i)}. ${pp}`).join('\n');

  return [
    `[DRAFT — direction for tailoring, not fabricated claims]`,
    ``,
    `Resume Emphasis for ${laneLabel} (${opp.fit_score ? `fit score: ${opp.fit_score}` : 'score pending'}):`,
    ``,
    `LEAD-WITH THEMES:`,
    emphasisLines || '  (No emphasis notes available for this lane)',
    ``,
    `SURFACE THESE PROOF POINTS:`,
    proofLines || '  (No proof points available for this lane)',
    ``,
    `Note: Replace bracketed placeholders with your real experience.`,
  ].join('\n');
}

/**
 * Generate a copy-ready cover note block.
 *
 * This is a short (3-paragraph), professional, role-aware draft.
 * Clearly marked as [DRAFT — review and personalise before use].
 * Suitable for ATS text fields or email introductions.
 *
 * Rules:
 * - uses existing lane/recommendation logic
 * - does NOT fabricate unsupported claims
 * - does NOT represent a final cover letter
 *
 * @param {object} opp - opportunity record
 * @param {string[]} topKeywords - top matched keywords for this role
 * @returns {string} copy-ready cover note (3 paragraphs, DRAFT labelled)
 */
export function generateCopyReadyCoverNoteBlock(opp, topKeywords = []) {
  const laneConfig = LANE_CONFIG[opp.lane] || LANE_CONFIG[LANES.OTHER];
  const laneLabel = laneConfig.label;
  const company = opp.company || '[Company]';
  const title = opp.title || '[Role Title]';
  const kwSnippet = topKeywords.slice(0, 3).join(', ') || 'technical delivery and stakeholder management';

  const PARA1 = {
    [LANES.TPM]: `I am a Technical Project Manager with a track record of owning end-to-end delivery for complex technical programmes across SDLC, infrastructure, and platform initiatives. My background spans ${kwSnippet}, and I am experienced in working across engineering, product, and business stakeholder groups to bring clarity, governance, and momentum to delivery.`,
    [LANES.DELIVERY_MANAGER]: `I am a Delivery Manager with strong Agile and SAFe delivery leadership experience across cross-functional squads. My background spans ${kwSnippet}, and I have a consistent record of driving sprint cadence, release management, and continuous improvement across technical delivery teams.`,
    [LANES.OPS_MANAGER]: `I am a Technical Operations Manager with experience governing ITSM, compliance, and operational readiness programmes in complex technical environments. My background spans ${kwSnippet}, and I have maintained service stability and audit-readiness across regulated and high-availability systems.`,
    [LANES.PROGRAM_MANAGER]: `I am a Programme Manager with experience leading enterprise-scale programmes across multiple workstreams and organisational boundaries. My background spans ${kwSnippet}, and I bring strong PMO governance, portfolio risk management, and executive stakeholder reporting capabilities.`,
    [LANES.GENERIC_PM]: `I am a Project Manager with cross-functional delivery experience and a background in ${kwSnippet}. I am interested in the ${title} role and bring structured delivery, stakeholder management, and programme governance to technical environments.`,
    [LANES.OTHER]: `I am an experienced professional with a background in ${kwSnippet}. I am interested in the ${title} role at ${company} and believe my delivery and coordination experience is relevant to this position.`,
  };

  const PARA2 = {
    [LANES.TPM]: `I am drawn to the ${title} opportunity at ${company} because [personalise — insert what specifically appeals about the role/company]. I am confident my experience in delivering technical programmes of this scale, combined with my ability to align cross-functional teams, makes me a strong candidate for this position.`,
    [LANES.DELIVERY_MANAGER]: `The ${title} role at ${company} aligns closely with my delivery leadership background. I am particularly interested in [personalise — insert specific appeal]. I bring strong execution discipline and a collaborative approach that I am confident would add value to your delivery organisation.`,
    [LANES.OPS_MANAGER]: `The ${title} role at ${company} is a strong match for my technical operations and governance background. I am drawn to [personalise — insert specific appeal]. My experience maintaining operational rigour across technical environments directly aligns with the requirements of this position.`,
    [LANES.PROGRAM_MANAGER]: `The ${title} role at ${company} aligns with my programme governance and portfolio management background. I am interested in [personalise — insert specific appeal]. I bring a structured approach to multi-workstream delivery and a track record of maintaining stakeholder alignment at executive level.`,
    [LANES.GENERIC_PM]: `I am interested in the ${title} role at ${company} because [personalise — insert specific appeal]. My structured delivery approach and stakeholder management experience are directly relevant to the responsibilities described in this posting.`,
    [LANES.OTHER]: `I am interested in the ${title} role at ${company} because [personalise — insert specific appeal]. I believe my background is relevant and I welcome the opportunity to discuss how I can contribute.`,
  };

  const PARA3 = `I have attached my resume for your review. I welcome the opportunity to discuss how my background aligns with the ${title} role at ${company}. Please feel free to contact me at your convenience.\n\n[Your Name]\n[Your Contact Details]`;

  const p1 = PARA1[opp.lane] || PARA1[LANES.OTHER];
  const p2 = PARA2[opp.lane] || PARA2[LANES.OTHER];

  return [
    `[DRAFT — review and personalise before use. This is a starting point, not a finished cover letter.]`,
    ``,
    p1,
    ``,
    p2,
    ``,
    PARA3,
  ].join('\n');
}

/**
 * Compute a pack readiness score (0–100).
 *
 * Indicates how complete and actionable the Apply Pack is.
 * Higher = more ready to move to application.
 */
export function computePackReadinessScore(opp, pack) {
  let score = 0;
  if (pack.recommended_resume_version) score += 15;
  if ((pack.keyword_mirror_list || []).length >= 5) score += 15;
  if ((pack.proof_points_to_surface || []).length >= 3) score += 15;
  if (pack.copy_ready_summary_block) score += 10;
  if (pack.copy_ready_resume_emphasis_block) score += 10;
  if (pack.copy_ready_cover_note_block) score += 10;
  if (opp.application_url) score += 15;
  if ((pack.apply_checklist || []).some(c => c.done)) score += 5;
  if (pack.recruiter_outreach_draft) score += 5;
  return Math.min(100, score);
}

// ─── Main Apply Pack Generator ────────────────────────────────────────────────

/**
 * Generate a full Apply Pack for an approved opportunity.
 * @param {object} opp - the opportunity record (must be approval_state='approved')
 * @param {Array|null} vault - resume vault (optional; uses INITIAL_VAULT if not provided)
 * @returns {object} apply_pack
 */
export function generateApplyPack(opp, vault = null) {
  if (opp.approval_state !== 'approved') {
    throw new Error(`Cannot generate Apply Pack: opportunity ${opp.id} is not approved (state: ${opp.approval_state})`);
  }

  const now = new Date().toISOString();
  const vaultToUse = vault || INITIAL_VAULT;

  // Resume recommendation — legacy scoring.js version (kept for backward compat)
  const resumeRec = recommendResumeVersion(opp.lane, opp.fit_score, opp.fit_signals || []);

  // Vault-based recommendation (richer, uses actual file metadata)
  const vaultRec = recommendVaultResume(opp.lane, opp.fit_score, opp.fit_signals || [], vaultToUse);

  // Quality gates check (no selected resume yet at generation time — advisory only)
  const qualityGates = getVaultQualityGates(opp, null, vaultToUse);

  // Checklist
  const applyChecklist = generateApplyChecklist(opp, resumeRec.version);

  // Follow-up date
  const suggestedFollowUpDate = suggestFollowUpDate(opp.fit_score);

  // Bullet emphasis
  const bulletEmphasisNotes = BULLET_EMPHASIS[opp.lane] || BULLET_EMPHASIS[LANES.OTHER];

  // Generate core prep (keywords, proof points, summary direction, outreach)
  const prep = generatePrepPackage(opp);

  const result = {
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

    // Resume recommendation (scoring.js — kept for backward compat)
    recommended_resume_version: resumeRec.version,
    recommendation_confidence: resumeRec.confidence,
    recommendation_reason: resumeRec.reason,

    // Vault-based recommendation (richer — actual file metadata)
    vault_recommended_resume_id: vaultRec.resume?.id || null,
    vault_recommended_resume_name: vaultRec.resume?.display_name || null,
    vault_recommendation_confidence: vaultRec.confidence,
    vault_recommendation_reason: vaultRec.reason,
    vault_recommendation_lane_match: vaultRec.lane_match,
    vault_recommendation_domain_overlap: vaultRec.domain_overlap,

    // Quality gates (advisory at generation time — no resume selected yet)
    quality_gate_warnings: qualityGates.warnings,
    quality_gate_blockers: qualityGates.blockers,

    // Override tracking (null until human overrides)
    resume_version_override: null,
    resume_version_override_reason: null,
    resume_version_override_at: null,
    original_system_recommendation: resumeRec.version,

    // Applied resume tracking (set when actually applied)
    resume_id_used: null,
    resume_override_reason: null,

    // Content
    keyword_mirror_list: prep.keywordMirrorList,
    proof_points_to_surface: prep.proofPointsToSurface,
    summary_direction: prep.summaryDirection,
    bullet_emphasis_notes: bulletEmphasisNotes,
    recruiter_outreach_draft: prep.outreach.recruiterDraft,
    hiring_manager_outreach_draft: prep.outreach.hiringManagerDraft,

    // Copy-ready blocks — draft-ready content, review before use
    copy_ready_summary_block: generateCopyReadySummaryBlock(opp, prep.keywordMirrorList),
    copy_ready_resume_emphasis_block: generateCopyReadyResumeEmphasisBlock(
      opp, bulletEmphasisNotes, prep.proofPointsToSurface
    ),
    copy_ready_cover_note_block: generateCopyReadyCoverNoteBlock(opp, prep.keywordMirrorList),
    apply_url_missing_at_generation: !(opp.application_url || '').trim(),

    // Workflow
    apply_checklist: applyChecklist,
    suggested_follow_up_date: suggestedFollowUpDate,
    next_action: prep.nextAction,
  };

  // Compute readiness score and embed it in the pack (persisted with the pack)
  const pack_readiness_score = computePackReadinessScore(opp, result);
  return { ...result, pack_readiness_score };
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
 * Also records the regeneration reason and re-computes pack_readiness_score.
 */
export function regenerateApplyPack(opp, existingPack, regenerationReason = 'manual', vault = null) {
  const fresh = generateApplyPack(opp, vault);
  const regenerated = {
    ...fresh,
    pack_version: (existingPack?.pack_version || 1) + 1,
    last_regenerated_at: new Date().toISOString(),
    regeneration_reason: regenerationReason,
    // Preserve override if one was set
    resume_version_override: existingPack?.resume_version_override || null,
    resume_version_override_reason: existingPack?.resume_version_override_reason || null,
    resume_version_override_at: existingPack?.resume_version_override_at || null,
    // Preserve applied resume tracking
    resume_id_used: existingPack?.resume_id_used || null,
    resume_override_reason: existingPack?.resume_override_reason || null,
    // original_system_recommendation is the NEW generation's recommendation
    original_system_recommendation: fresh.recommended_resume_version,
    // Preserve checklist done-state from previous pack
    apply_checklist: fresh.apply_checklist.map(item => {
      const prev = existingPack?.apply_checklist?.find(p => p.id === item.id);
      return prev ? { ...item, done: prev.done } : item;
    }),
  };
  // Re-compute readiness score with the regenerated pack
  regenerated.pack_readiness_score = computePackReadinessScore(opp, regenerated);
  return regenerated;
}
