/**
 * Stale / Ghosted Detection Logic
 *
 * Detects opportunities that have gone silent and need follow-up or marking.
 * Thresholds are intentionally conservative — err on the side of flagging.
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────

const STALE_THRESHOLDS_DAYS = {
  // No response after applying
  applied: 21,
  // In active interview but no movement
  interviewing: 14,
  // Offer pending, no update
  offer: 7,
  // Approved but not yet applied
  approved: 30,
};

const GHOSTED_THRESHOLDS_DAYS = {
  applied: 42,
  interviewing: 28,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Evaluate staleness for a single opportunity.
 *
 * @param {object} opp - { status, last_action_date, applied_date }
 * @returns {{ isStale: boolean, isGhosted: boolean, daysSinceAction: number, reason: string|null }}
 */
export function evaluateStaleness(opp) {
  const { status, last_action_date, applied_date } = opp;
  const staleThreshold = STALE_THRESHOLDS_DAYS[status];
  const ghostedThreshold = GHOSTED_THRESHOLDS_DAYS[status];

  if (!staleThreshold) {
    return { isStale: false, isGhosted: false, daysSinceAction: 0, reason: null };
  }

  const referenceDate = last_action_date || applied_date;
  const days = daysSince(referenceDate);

  if (ghostedThreshold && days >= ghostedThreshold) {
    return {
      isStale: true,
      isGhosted: true,
      daysSinceAction: days,
      reason: `No response in ${days} days — likely ghosted.`,
    };
  }

  if (days >= staleThreshold) {
    return {
      isStale: true,
      isGhosted: false,
      daysSinceAction: days,
      reason: `No activity in ${days} days — follow up or close.`,
    };
  }

  return { isStale: false, isGhosted: false, daysSinceAction: days, reason: null };
}

/**
 * Scan a list of opportunities and return those that are stale or ghosted.
 *
 * @param {object[]} opportunities
 * @returns {object[]} - enriched opportunities with staleness info
 */
export function scanForStale(opportunities = []) {
  const results = [];

  for (const opp of opportunities) {
    const staleness = evaluateStaleness(opp);
    if (staleness.isStale || staleness.isGhosted) {
      results.push({
        ...opp,
        ...staleness,
        suggestedNextStatus: staleness.isGhosted ? 'ghosted' : 'stale',
        suggestedAction: staleness.isGhosted
          ? 'Mark as ghosted — no response after extended period.'
          : `Follow up or close — ${staleness.reason}`,
      });
    }
  }

  return results;
}

/**
 * Compute next follow-up date for an opportunity based on its current status.
 */
export function computeNextAction(opp) {
  const { status, applied_date, last_action_date } = opp;
  const now = new Date();

  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r.toISOString().split('T')[0];
  };

  const base = last_action_date ? new Date(last_action_date) : now;

  switch (status) {
    case 'applied':
      return { action: 'Follow up if no response', due: addDays(base, 14) };
    case 'interviewing':
      return { action: 'Send thank-you / check on next steps', due: addDays(base, 3) };
    case 'offer':
      return { action: 'Respond to offer or request extension', due: addDays(base, 3) };
    case 'approved':
      return { action: 'Submit application', due: addDays(applied_date ? new Date(applied_date) : now, 7) };
    default:
      return null;
  }
}
