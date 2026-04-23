/**
 * Outreach Cadence + Follow-Up Logic — netlify/functions/_shared/outreach.js
 *
 * Provides:
 * - Standard outreach cadence timeline (day 0 → day 7 → day 14 → stale)
 * - Outreach tracking defaults (what was sent, when, response status)
 * - Follow-up draft builders (referral ask, first follow-up, second follow-up)
 * - Utility helpers for "follow-ups due today" and "outreach overdue"
 * - Response rate analysis (with outreach vs without outreach)
 *
 * Rules:
 * - Do NOT auto-send anything. All drafts are for manual copy-paste only.
 * - No LinkedIn scraping. No browser automation. No approval weakening.
 * - Approval gate is untouched.
 */

import { LANES, LANE_CONFIG } from './scoring.js';

// ─── Cadence Constants ────────────────────────────────────────────────────────

/**
 * Standard follow-up cadence in days after application submission.
 * Day 7 = first follow-up; Day 14 = second follow-up; Day 21+ = stale/ghosted.
 */
export const FOLLOW_UP_CADENCE = {
  FIRST_FOLLOW_UP_DAYS:  7,
  SECOND_FOLLOW_UP_DAYS: 14,
  STALE_DAYS:            21,
};

/**
 * Outreach types for tracking.
 */
export const OUTREACH_TYPE = {
  RECRUITER:       'recruiter',
  HIRING_MANAGER:  'hiring_manager',
  REFERRAL_ASK:    'referral_ask',
  FOLLOW_UP_1:     'follow_up_1',
  FOLLOW_UP_2:     'follow_up_2',
};

/**
 * Outcome labels for interview/outcome tracking.
 */
export const INTERVIEW_STAGE = {
  NONE:             'none',
  SCREENING_BOOKED: 'screening_booked',
  SCREENING_DONE:   'screening_done',
  INTERVIEW_1:      'interview_1',
  INTERVIEW_2:      'interview_2',
  FINAL_ROUND:      'final_round',
  OFFER:            'offer',
  CLOSED:           'closed',
};

export const OUTCOME = {
  PENDING:       'pending',
  NO_RESPONSE:   'no_response',
  REJECTED:      'rejected',
  OFFER_MADE:    'offer_made',
  OFFER_ACCEPTED:'offer_accepted',
  WITHDRAWN:     'withdrawn',
};

// ─── Default Tracking Record ──────────────────────────────────────────────────

/**
 * Default outreach tracking fields for a new opportunity.
 * Embedded in the Apply Pack at generation time.
 * Updated manually as the operator takes action.
 */
export const DEFAULT_OUTREACH_TRACKING = {
  outreach_sent:          false,   // Has any outreach been sent?
  outreach_type:          null,    // OUTREACH_TYPE value
  outreach_date:          null,    // ISO date string when outreach was sent
  follow_up_1_sent:       false,   // Has first follow-up been sent?
  follow_up_1_date:       null,    // ISO date string
  follow_up_2_sent:       false,   // Has second follow-up been sent?
  follow_up_2_date:       null,    // ISO date string
  recruiter_response:     false,   // Did recruiter respond?
  recruiter_response_date:null,    // ISO date string
  screening_call:         false,   // Was a screening call booked?
  screening_call_date:    null,    // ISO date string
  interview_stage:        INTERVIEW_STAGE.NONE,
  outcome:                OUTCOME.PENDING,
  last_touch_date:        null,    // Most recent outreach/response date
  notes:                  null,    // Free-text operator notes
};

// ─── Cadence Date Helpers ─────────────────────────────────────────────────────

/**
 * Given the date an application was submitted (or current date if not known),
 * compute the standard cadence dates.
 *
 * @param {string|null} appliedDate - ISO date string, or null to use today
 * @returns {{ follow_up_1_due: string, follow_up_2_due: string, stale_after: string }}
 */
export function computeFollowUpCadence(appliedDate = null) {
  const base = appliedDate ? new Date(appliedDate) : new Date();
  const add = (days) => {
    const d = new Date(base.getTime() + days * 86400000);
    return d.toISOString().slice(0, 10);
  };
  return {
    follow_up_1_due:  add(FOLLOW_UP_CADENCE.FIRST_FOLLOW_UP_DAYS),
    follow_up_2_due:  add(FOLLOW_UP_CADENCE.SECOND_FOLLOW_UP_DAYS),
    stale_after:      add(FOLLOW_UP_CADENCE.STALE_DAYS),
  };
}

/**
 * Returns how many days since application, or null if no applied date.
 * @param {string|null} appliedDate
 * @returns {number|null}
 */
export function daysSinceApplied(appliedDate) {
  if (!appliedDate) return null;
  const diff = Date.now() - new Date(appliedDate).getTime();
  return Math.floor(diff / 86400000);
}

/**
 * Returns whether the first follow-up is now due (>= 7 days since applied)
 * but not yet sent.
 */
export function isFollowUp1Due(opp) {
  if (opp.follow_up_1_sent) return false;
  if (!['applied', 'follow_up_1'].includes(opp.status)) return false;
  const days = daysSinceApplied(opp.applied_date || opp.last_action_date);
  if (days === null) return false;
  return days >= FOLLOW_UP_CADENCE.FIRST_FOLLOW_UP_DAYS;
}

/**
 * Returns whether the second follow-up is now due (>= 14 days since applied)
 * but not yet sent.
 */
export function isFollowUp2Due(opp) {
  if (opp.follow_up_2_sent) return false;
  if (!['applied', 'follow_up_1', 'follow_up_2'].includes(opp.status)) return false;
  const days = daysSinceApplied(opp.applied_date || opp.last_action_date);
  if (days === null) return false;
  return days >= FOLLOW_UP_CADENCE.SECOND_FOLLOW_UP_DAYS;
}

/**
 * Returns whether a role is stale (no outreach/response in 21+ days after applying).
 */
export function isOutreachStale(opp) {
  if (['rejected', 'ghosted', 'withdrawn', 'interviewing', 'offer'].includes(opp.status)) return false;
  if (!['applied', 'follow_up_1', 'follow_up_2'].includes(opp.status)) return false;
  const days = daysSinceApplied(opp.applied_date || opp.last_action_date);
  if (days === null) return false;
  return days >= FOLLOW_UP_CADENCE.STALE_DAYS && !opp.recruiter_response;
}

/**
 * Returns the next touch recommendation for an opportunity.
 * @param {object} opp
 * @returns {{ action: string, urgency: 'high'|'medium'|'low', due: string|null }}
 */
export function getNextTouchRecommendation(opp) {
  if (['rejected', 'ghosted', 'withdrawn'].includes(opp.status)) {
    return { action: 'No action — role closed', urgency: 'low', due: null };
  }

  if (opp.status === 'interviewing') {
    return { action: 'Prepare for next interview stage — review proof points', urgency: 'high', due: null };
  }

  if (opp.status === 'offer') {
    return { action: 'Review offer details and respond', urgency: 'high', due: null };
  }

  if (isOutreachStale(opp)) {
    return { action: 'Role stale — send second follow-up or mark ghosted', urgency: 'high', due: null };
  }

  if (isFollowUp2Due(opp)) {
    return { action: 'Send second follow-up (day 14)', urgency: 'high', due: opp.next_action_due || null };
  }

  if (isFollowUp1Due(opp)) {
    return { action: 'Send first follow-up (day 7)', urgency: 'medium', due: opp.next_action_due || null };
  }

  if (['applied', 'follow_up_1'].includes(opp.status) && !opp.outreach_sent) {
    return { action: 'Send recruiter or hiring manager outreach — not yet sent', urgency: 'medium', due: null };
  }

  if (opp.status === 'approved' || opp.approval_state === 'approved') {
    return { action: 'Submit application and send outreach', urgency: 'medium', due: null };
  }

  return { action: 'Review when ready', urgency: 'low', due: null };
}

/**
 * Returns all opportunities that have a follow-up action due today or overdue.
 * Used for the Dashboard panel.
 *
 * @param {Array} opps - all opportunities
 * @returns {Array} sorted by next_action_due asc
 */
export function getFollowUpsDue(opps) {
  const now = new Date();
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  endOfTomorrow.setHours(23, 59, 59, 999);

  return opps
    .filter(o => {
      if (['rejected', 'ghosted', 'withdrawn'].includes(o.status)) return false;
      if (!['applied', 'follow_up_1', 'follow_up_2'].includes(o.status)) return false;
      if (o.next_action_due) {
        return new Date(o.next_action_due) <= endOfTomorrow;
      }
      // Fallback: check cadence-based due
      return isFollowUp1Due(o) || isFollowUp2Due(o);
    })
    .sort((a, b) => new Date(a.next_action_due || 0) - new Date(b.next_action_due || 0));
}

/**
 * Returns applied roles with no outreach sent yet (and not rejected/ghosted).
 * @param {Array} opps
 * @returns {Array}
 */
export function getAppliedUntouched(opps) {
  return opps.filter(o =>
    ['applied', 'follow_up_1', 'follow_up_2'].includes(o.status) &&
    !o.outreach_sent &&
    !['rejected', 'ghosted', 'withdrawn'].includes(o.status)
  );
}

// ─── Response Rate Analysis ───────────────────────────────────────────────────

/**
 * Compute response rates with and without outreach.
 * Response = recruiter_response === true, or status = interviewing/offer.
 *
 * @param {Array} opps
 * @returns {{ withOutreach: object, withoutOutreach: object, totalApplied: number }}
 */
export function computeOutreachResponseRate(opps) {
  const applied = opps.filter(o =>
    ['applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer', 'rejected', 'ghosted'].includes(o.status)
  );

  const withOutreach = applied.filter(o => o.outreach_sent);
  const withoutOutreach = applied.filter(o => !o.outreach_sent);

  const responded = (arr) => arr.filter(o =>
    o.recruiter_response || ['interviewing', 'offer'].includes(o.status)
  ).length;

  const responseRate = (arr) => arr.length > 0 ? Math.round((responded(arr) / arr.length) * 100) : null;

  return {
    totalApplied:    applied.length,
    withOutreach: {
      count:        withOutreach.length,
      responses:    responded(withOutreach),
      responseRate: responseRate(withOutreach),
    },
    withoutOutreach: {
      count:         withoutOutreach.length,
      responses:     responded(withoutOutreach),
      responseRate:  responseRate(withoutOutreach),
    },
  };
}

// ─── Outreach Draft Builders ──────────────────────────────────────────────────

/**
 * Build a referral ask draft.
 * Use when you have a mutual contact or connection at the target employer.
 *
 * @param {object} opp
 * @returns {string}
 */
export function buildReferralAskDraft(opp) {
  const company = opp.company || '[Company]';
  const title = opp.title || '[Role Title]';
  const laneLabel = LANE_CONFIG[opp.lane]?.label || 'Project Manager';

  return `Hi [Contact Name],

I hope you're doing well. I wanted to reach out because I noticed a ${title} opportunity at ${company} that looks like a strong match for my background.

As you know, I have been working as a ${laneLabel} and I have [X] years of experience in [key skill relevant to the role]. This role looks well-aligned with what I've been building toward.

Would you be open to referring me, or putting me in touch with the hiring manager? I've already applied through the official channel — a referral or warm introduction would make a real difference.

I'll make it easy — happy to send you a short note you could forward, or just a link to my application. Whatever works for you.

No pressure at all, and thank you for considering it.

Kind regards,
Sample Candidate`;
}

/**
 * Build a first follow-up draft (day 7 after application).
 * Brief, professional, non-pushy.
 *
 * @param {object} opp
 * @returns {string}
 */
export function buildFirstFollowUpDraft(opp) {
  const company = opp.company || '[Company]';
  const title = opp.title || '[Role Title]';

  return `Hi [Recruiter / Hiring Manager Name],

I wanted to briefly follow up on my application for the ${title} role at ${company}, submitted approximately one week ago.

I remain very interested in this opportunity and would welcome the chance to discuss how my background aligns with what you're looking for.

Please let me know if any additional information would be helpful. I look forward to hearing from you.

Kind regards,
Sample Candidate`;
}

/**
 * Build a second follow-up draft (day 14 after application).
 * Slightly more direct, still professional. Final nudge.
 *
 * @param {object} opp
 * @returns {string}
 */
export function buildSecondFollowUpDraft(opp) {
  const company = opp.company || '[Company]';
  const title = opp.title || '[Role Title]';

  return `Hi [Recruiter / Hiring Manager Name],

I am following up once more regarding the ${title} role at ${company}. I applied approximately two weeks ago and followed up last week.

I understand you are likely managing many applications. I want to restate my genuine interest — this role aligns closely with my background in [key relevant area] and I would welcome a brief conversation.

If the role has been filled or if my profile is not the right fit at this stage, I completely understand — please feel free to let me know.

Thank you for your time.

Kind regards,
Sample Candidate`;
}

/**
 * Build talking points for a specific opportunity (for use in outreach personalisation).
 * Returns 3–5 short bullet points based on the role's lane and fit signals.
 *
 * @param {object} opp
 * @returns {string[]}
 */
export function buildRoleTalkingPoints(opp) {
  const lane = opp.lane || 'other';
  const company = opp.company || '[Company]';

  const BASE = {
    [LANES.TPM]: [
      `I own end-to-end SDLC delivery for complex technical programmes — from scoping through deployment`,
      `I bridge engineering, product, and business stakeholder groups to align on delivery priorities`,
      `I have delivered platform and infrastructure programmes in [relevant technology environment]`,
      `I use Agile/Scrum/SAFe to maintain delivery cadence across distributed technical teams`,
      `My background directly maps to the ${opp.title} requirements at ${company}`,
    ],
    [LANES.DELIVERY_MANAGER]: [
      `I lead Agile delivery across cross-functional squads, owning sprint cadence and release management`,
      `I have a track record of improving team velocity and on-time delivery rates`,
      `I work across engineering and product stakeholders to resolve delivery blockers at pace`,
      `My SAFe/Scrum delivery experience is directly relevant to the ${opp.title} role`,
      `I focus on enabling engineering teams to deliver predictably, not just coordinating meetings`,
    ],
    [LANES.OPS_MANAGER]: [
      `I govern ITSM, compliance, and operational readiness in complex technical environments`,
      `I have maintained uptime and audit-readiness across regulated/high-availability systems`,
      `My background in service management frameworks (ITIL, ITSM) maps to this role's requirements`,
      `I have led change management and incident response processes that reduced downtime`,
      `I understand the technical depth required for a ${opp.title} role at ${company}`,
    ],
    [LANES.PROGRAM_MANAGER]: [
      `I govern enterprise-scale programmes spanning multiple workstreams and business units`,
      `I have established PMO frameworks, portfolio governance, and board-level reporting`,
      `My risk management and dependency resolution experience fits the programme scale at ${company}`,
      `I bring executive stakeholder management experience in [relevant domain]`,
      `The governance complexity at ${company} maps directly to my programme management background`,
    ],
    [LANES.GENERIC_PM]: [
      `I manage project delivery across cross-functional teams with strong stakeholder coordination`,
      `My background includes [relevant domain], which is relevant to this role`,
      `I bring structured delivery discipline to ambiguous project environments`,
    ],
  };

  return (BASE[lane] || BASE[LANES.GENERIC_PM]).slice(0, 5);
}
