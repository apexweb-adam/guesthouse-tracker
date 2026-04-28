/**
 * Readiness Classification Utilities
 *
 * Classifies opportunities into actionable readiness groups and generates
 * "best next action" recommendations for the dashboard Action Center.
 *
 * Single source of truth: scoring and pack logic stay in their own modules.
 * This module composes those signals into operational decision support.
 *
 * Do NOT re-implement scoring or readiness computation here.
 * Use pack_readiness_score from the pack/opportunity record.
 */

// ─── Readiness Groups ─────────────────────────────────────────────────────────

export const READINESS_GROUPS = {
  READY_TO_APPLY: 'ready_to_apply',
  NEEDS_APPLY_URL: 'needs_apply_url',
  NEEDS_APPROVAL: 'needs_approval',
  APPLIED_FOLLOW_UP: 'applied_follow_up',
  IN_PROGRESS: 'in_progress',
  LOW_PRIORITY: 'low_priority',
};

export const READINESS_GROUP_LABELS = {
  [READINESS_GROUPS.READY_TO_APPLY]: 'Ready to Apply Now',
  [READINESS_GROUPS.NEEDS_APPLY_URL]: 'Needs Apply URL',
  [READINESS_GROUPS.NEEDS_APPROVAL]: 'Needs Approval / Review',
  [READINESS_GROUPS.APPLIED_FOLLOW_UP]: 'Applied — Follow-up Due',
  [READINESS_GROUPS.IN_PROGRESS]: 'In Progress',
  [READINESS_GROUPS.LOW_PRIORITY]: 'Low Priority / Weak Fit',
};

export const READINESS_GROUP_ORDER = [
  READINESS_GROUPS.READY_TO_APPLY,
  READINESS_GROUPS.NEEDS_APPLY_URL,
  READINESS_GROUPS.NEEDS_APPROVAL,
  READINESS_GROUPS.APPLIED_FOLLOW_UP,
  READINESS_GROUPS.IN_PROGRESS,
  READINESS_GROUPS.LOW_PRIORITY,
];

// ─── Classify a single opportunity ───────────────────────────────────────────

/**
 * Classify an opportunity into a readiness group.
 *
 * Combines: approval_state, status, pack_readiness_score, application_url,
 * next_action_due, fit_score, recommended.
 *
 * @param {Object} opp - opportunity record (may include pack_readiness_score)
 * @returns {string} READINESS_GROUPS value
 */
export function classifyReadinessGroup(opp) {
  const {
    approval_state,
    status,
    pack_readiness_score,
    application_url,
    next_action_due,
    fit_score,
    recommended,
  } = opp;

  // Terminal states — not actionable
  if (['rejected', 'ghosted', 'withdrawn'].includes(status)) {
    return READINESS_GROUPS.LOW_PRIORITY;
  }

  // Applied/interviewing/offer — check follow-up
  if (['applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer'].includes(status)) {
    if (next_action_due) {
      const due = new Date(next_action_due);
      const now = new Date();
      const diffDays = (due - now) / 86400000;
      if (diffDays <= 2) return READINESS_GROUPS.APPLIED_FOLLOW_UP;
    }
    return READINESS_GROUPS.IN_PROGRESS;
  }

  // Pending approval — needs review, but only if has some fit merit
  if (approval_state === 'pending' && !['rejected', 'ghosted', 'stale'].includes(status)) {
    // Low-fit non-recommended pending opps are low priority
    if (!recommended && (fit_score || 0) < 40) return READINESS_GROUPS.LOW_PRIORITY;
    return READINESS_GROUPS.NEEDS_APPROVAL;
  }

  // Approved — check readiness
  if (approval_state === 'approved') {
    // Missing apply URL is a hard blocker
    if (!application_url) {
      return READINESS_GROUPS.NEEDS_APPLY_URL;
    }

    // High readiness score → ready to apply
    const readiness = pack_readiness_score || 0;
    if (readiness >= 70) {
      return READINESS_GROUPS.READY_TO_APPLY;
    }

    // Approved but low readiness — in progress
    return READINESS_GROUPS.IN_PROGRESS;
  }

  // Discovered / queued — low priority
  if (!recommended || (fit_score || 0) < 40) {
    return READINESS_GROUPS.LOW_PRIORITY;
  }

  return READINESS_GROUPS.NEEDS_APPROVAL;
}

// ─── Get readiness reason / blocked state ────────────────────────────────────

/**
 * Returns a human-readable reason why an opportunity is in its current group.
 * Used for "blocked state" UI hints.
 *
 * @param {Object} opp
 * @returns {string}
 */
export function getReadinessReason(opp) {
  const group = classifyReadinessGroup(opp);

  switch (group) {
    case READINESS_GROUPS.READY_TO_APPLY:
      return `Pack readiness ${opp.pack_readiness_score || 0}% — apply URL confirmed`;

    case READINESS_GROUPS.NEEDS_APPLY_URL:
      return 'Blocked: apply URL not yet added';

    case READINESS_GROUPS.NEEDS_APPROVAL:
      if (opp.approval_state === 'pending') return 'Waiting for your approval decision';
      return 'Not yet approved';

    case READINESS_GROUPS.APPLIED_FOLLOW_UP:
      return opp.next_action_due
        ? `Follow-up due ${opp.next_action_due}`
        : 'Follow-up action pending';

    case READINESS_GROUPS.IN_PROGRESS:
      if (['interviewing'].includes(opp.status)) return 'Interview in progress';
      if (['offer'].includes(opp.status)) return 'Offer stage';
      if ((opp.pack_readiness_score || 0) < 70) return `Pack readiness ${opp.pack_readiness_score || 0}% — review Apply Pack`;
      return 'In progress';

    case READINESS_GROUPS.LOW_PRIORITY:
      if (['rejected', 'ghosted', 'withdrawn'].includes(opp.status)) return 'Closed / not active';
      if (!opp.recommended) return 'Below recommendation threshold';
      return 'Low fit score';

    default:
      return '';
  }
}

// ─── Group opportunities ──────────────────────────────────────────────────────

/**
 * Group an array of opportunities by readiness.
 *
 * @param {Array} opps
 * @returns {Object} { [groupKey]: opp[] }
 */
export function groupByReadiness(opps) {
  const groups = {};
  for (const g of READINESS_GROUP_ORDER) groups[g] = [];

  for (const opp of opps) {
    const group = classifyReadinessGroup(opp);
    if (!groups[group]) groups[group] = [];
    groups[group].push(opp);
  }

  // Within each group, sort by pack_readiness_score desc, then fit_score desc
  for (const g of READINESS_GROUP_ORDER) {
    groups[g].sort((a, b) =>
      (b.pack_readiness_score || 0) - (a.pack_readiness_score || 0) ||
      (b.fit_score || 0) - (a.fit_score || 0)
    );
  }

  return groups;
}

// ─── Best Next Actions ────────────────────────────────────────────────────────

/**
 * Compute the "best next actions" for the Action Center.
 *
 * Returns an array of action items with type, label, and relevant opportunities.
 * Capped to avoid overwhelming the user.
 *
 * @param {Array} opps - all opportunities
 * @returns {Array} action items
 */
export function getBestNextActions(opps) {
  const groups = groupByReadiness(opps);
  const actions = [];

  const readyNow = groups[READINESS_GROUPS.READY_TO_APPLY] || [];
  const needsUrl = groups[READINESS_GROUPS.NEEDS_APPLY_URL] || [];
  const needsApproval = groups[READINESS_GROUPS.NEEDS_APPROVAL] || [];
  const followUp = groups[READINESS_GROUPS.APPLIED_FOLLOW_UP] || [];
  const stale = opps.filter(o => o.stale_flag || o.isStale);

  // Jobs with apply pack generated — high priority signal to actually apply
  const packGenerated = opps.filter(o =>
    o.approval_state === 'approved' &&
    o.apply_pack &&
    ['apply_pack_generated', 'ready_to_apply'].includes(o.status) &&
    !['rejected', 'ghosted', 'withdrawn'].includes(o.status)
  );

  if (readyNow.length > 0) {
    actions.push({
      type: 'ready_to_apply',
      priority: 1,
      label: `${readyNow.length} role${readyNow.length === 1 ? '' : 's'} ${readyNow.length === 1 ? 'is' : 'are'} ready to apply now`,
      detail: `Highest readiness: ${readyNow[0].title} @ ${readyNow[0].company} (${readyNow[0].pack_readiness_score || 0}%)`,
      topOpp: readyNow[0],
      count: readyNow.length,
      opps: readyNow.slice(0, 3),
    });
  }

  if (packGenerated.length > 0) {
    actions.push({
      type: 'pack_generated',
      priority: readyNow.length > 0 ? 2 : 1,
      label: `${packGenerated.length} apply pack${packGenerated.length === 1 ? '' : 's'} generated — open and apply!`,
      detail: `Start with: ${packGenerated[0].title} @ ${packGenerated[0].company}`,
      topOpp: packGenerated[0],
      count: packGenerated.length,
      opps: packGenerated.slice(0, 3),
    });
  }

  if (followUp.length > 0) {
    actions.push({
      type: 'follow_up_due',
      priority: 2,
      label: `${followUp.length} applied role${followUp.length === 1 ? '' : 's'} need${followUp.length === 1 ? 's' : ''} follow-up`,
      detail: followUp[0].next_action_due
        ? `${followUp[0].title} @ ${followUp[0].company} — due ${followUp[0].next_action_due}`
        : `${followUp[0].title} @ ${followUp[0].company}`,
      topOpp: followUp[0],
      count: followUp.length,
      opps: followUp.slice(0, 3),
    });
  }

  if (needsUrl.length > 0) {
    actions.push({
      type: 'needs_apply_url',
      priority: 3,
      label: `${needsUrl.length} approved role${needsUrl.length === 1 ? '' : 's'} ${needsUrl.length === 1 ? 'is' : 'are'} blocked — missing apply URL`,
      detail: `Add apply URL to unlock full readiness: ${needsUrl[0].title} @ ${needsUrl[0].company}`,
      topOpp: needsUrl[0],
      count: needsUrl.length,
      opps: needsUrl.slice(0, 3),
    });
  }

  if (needsApproval.length > 0) {
    const highFit = needsApproval.filter(o => (o.fit_score || 0) >= 70);
    if (highFit.length > 0) {
      actions.push({
        type: 'needs_approval',
        priority: 4,
        label: `${highFit.length} high-fit role${highFit.length === 1 ? '' : 's'} waiting for approval`,
        detail: `Top pending: ${highFit[0].title} @ ${highFit[0].company} (fit: ${highFit[0].fit_score})`,
        topOpp: highFit[0],
        count: highFit.length,
        opps: highFit.slice(0, 3),
      });
    }
  }

  if (stale.length > 0) {
    actions.push({
      type: 'stale_review',
      priority: 5,
      label: `${stale.length} role${stale.length === 1 ? '' : 's'} may be stale — review or archive`,
      detail: `${stale[0].title} @ ${stale[0].company}`,
      topOpp: stale[0],
      count: stale.length,
      opps: stale.slice(0, 3),
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

// ─── Readiness Summary (for digest/reporting) ─────────────────────────────────

/**
 * Compute a readiness summary object suitable for digest/reporting.
 *
 * @param {Array} opps - all opportunities
 * @returns {Object} readiness summary
 */
export function computeReadinessSummary(opps) {
  const activeOpps = opps.filter(o => !['rejected', 'ghosted', 'withdrawn'].includes(o.status));
  const groups = groupByReadiness(activeOpps);

  const readyToApply = groups[READINESS_GROUPS.READY_TO_APPLY] || [];
  const needsUrl = groups[READINESS_GROUPS.NEEDS_APPLY_URL] || [];
  const needsApproval = groups[READINESS_GROUPS.NEEDS_APPROVAL] || [];
  const followUp = groups[READINESS_GROUPS.APPLIED_FOLLOW_UP] || [];
  const inProgress = groups[READINESS_GROUPS.IN_PROGRESS] || [];

  const highReadiness = readyToApply.filter(o => (o.pack_readiness_score || 0) >= 85);

  return {
    readyToApplyCount: readyToApply.length,
    highReadinessCount: highReadiness.length,
    blockedByMissingUrlCount: needsUrl.length,
    needsApprovalCount: needsApproval.length,
    appliedFollowUpDueCount: followUp.length,
    inProgressCount: inProgress.length,
    topReadyToApply: readyToApply.slice(0, 3).map(o => ({
      id: o.id,
      title: o.title,
      company: o.company,
      pack_readiness_score: o.pack_readiness_score || 0,
      fit_score: o.fit_score || 0,
    })),
  };
}
