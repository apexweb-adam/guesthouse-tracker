/**
 * Conversion Metrics Layer — _shared/conversionMetrics.js
 *
 * Answers the key measurement questions:
 * - Which sources convert (generate responses)?
 * - Which employer types respond?
 * - Which resume versions perform better?
 * - Does outreach actually help?
 * - Which role lanes are wasting time?
 *
 * Rules:
 * - No auto-submit. No fake AI scoring. No vanity metrics.
 * - All metrics are computed from real operator-entered data.
 * - No new personal data required.
 * - Approval gate is untouched.
 */

import { computeOutreachResponseRate } from './outreach.js';
import { LANE_CONFIG } from './scoring.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum application count per segment before a comparison is considered valid.
 * Below this threshold, results are surfaced but flagged as "insufficient data".
 */
export const MIN_SAMPLE_FOR_INSIGHT = 3;

/**
 * Experiment type identifiers for structured A/B tracking.
 */
export const EXPERIMENT_TYPE = {
  RESUME_COMPARISON:      'resume_comparison',
  SOURCE_COMPARISON:      'source_comparison',
  DIRECT_VS_INTERMEDIARY: 'direct_vs_intermediary',
  OUTREACH_VS_NONE:       'outreach_vs_none',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the opportunity represents a meaningful application record.
 * Excludes purely pending/discovered records from funnel analysis.
 */
function isAppliedRecord(o) {
  return ['applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer', 'rejected', 'ghosted'].includes(o.status);
}

/**
 * Returns true if the opportunity has generated a response.
 * Response = recruiter_response flag OR status reached interviewing/offer.
 */
function hasResponse(o) {
  return !!(o.recruiter_response || ['interviewing', 'offer'].includes(o.status));
}

/**
 * Rate as a percentage integer, or null if denominator is 0.
 */
function pct(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

// ─── Core Conversion Funnel ───────────────────────────────────────────────────

/**
 * Compute the full application conversion funnel.
 *
 * Returns counts and rates for each stage from application through to offer.
 *
 * @param {Array} opps - all opportunities
 * @returns {{
 *   applications_sent: number,
 *   responses: number,
 *   screens: number,
 *   interviews: number,
 *   offers: number,
 *   rejections: number,
 *   no_responses: number,
 *   response_rate: number|null,
 *   screen_rate: number|null,
 *   interview_rate: number|null,
 *   offer_rate: number|null,
 * }}
 */
export function computeConversionFunnel(opps) {
  const applied = opps.filter(isAppliedRecord);

  const responses   = applied.filter(hasResponse);
  const screens     = applied.filter(o => o.screening_call || ['interviewing', 'offer'].includes(o.status));
  const interviews  = applied.filter(o =>
    ['interviewing', 'offer'].includes(o.status) ||
    (o.interview_stage && o.interview_stage !== 'none' && o.interview_stage !== INTERVIEW_STAGE_NONE)
  );
  const offers      = applied.filter(o =>
    o.outcome === 'offer_made' || o.outcome === 'offer_accepted' || o.status === 'offer'
  );
  const rejections  = applied.filter(o => o.outcome === 'rejected' || o.status === 'rejected');
  const noResponse  = applied.filter(o =>
    !hasResponse(o) && ['ghosted', 'rejected'].includes(o.status)
  );

  const n = applied.length;
  return {
    applications_sent: n,
    responses:         responses.length,
    screens:           screens.length,
    interviews:        interviews.length,
    offers:            offers.length,
    rejections:        rejections.length,
    no_responses:      noResponse.length,
    response_rate:     pct(responses.length, n),
    screen_rate:       pct(screens.length, n),
    interview_rate:    pct(interviews.length, n),
    offer_rate:        pct(offers.length, n),
  };
}

// Guard string used in interview_stage comparison above — matches INTERVIEW_STAGE in outreach.js
const INTERVIEW_STAGE_NONE = 'none';

// ─── Response Rate by Source Family ──────────────────────────────────────────

/**
 * Compute response rates grouped by source_family.
 *
 * @param {Array} opps
 * @returns {Array<{
 *   source_family: string,
 *   total: number,
 *   responses: number,
 *   response_rate: number|null,
 *   has_enough_data: boolean,
 * }>} sorted by response_rate descending
 */
export function computeResponseRateBySource(opps) {
  const applied = opps.filter(isAppliedRecord);
  const map = {};

  for (const o of applied) {
    const sf = o.source_family || 'manual';
    if (!map[sf]) map[sf] = { source_family: sf, total: 0, responses: 0 };
    map[sf].total++;
    if (hasResponse(o)) map[sf].responses++;
  }

  return Object.values(map)
    .map(s => ({
      ...s,
      response_rate:    pct(s.responses, s.total),
      has_enough_data:  s.total >= MIN_SAMPLE_FOR_INSIGHT,
    }))
    .sort((a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1));
}

// ─── Response Rate by Employer Type ──────────────────────────────────────────

/**
 * Compute response rates split by direct employer vs intermediary/staffing firm.
 *
 * @param {Array} opps
 * @returns {{ direct: object, intermediary: object }}
 */
export function computeResponseRateByEmployerType(opps) {
  const applied = opps.filter(isAppliedRecord);
  const direct       = applied.filter(o => !o.is_intermediary);
  const intermediary = applied.filter(o => !!o.is_intermediary);

  const summarise = (arr, label) => {
    const responses = arr.filter(hasResponse).length;
    return {
      label,
      total:           arr.length,
      responses,
      response_rate:   pct(responses, arr.length),
      has_enough_data: arr.length >= MIN_SAMPLE_FOR_INSIGHT,
    };
  };

  return {
    direct:       summarise(direct,       'Direct Employer'),
    intermediary: summarise(intermediary, 'Intermediary / Staffing Firm'),
  };
}

// ─── Response Rate by Resume Version ─────────────────────────────────────────

/**
 * Compute response rates grouped by resume version actually used.
 *
 * Priority for resume version field:
 *   resume_id_used (actual) > vault_recommended_resume_id > recommended_resume_version > 'unknown'
 *
 * @param {Array} opps
 * @returns {Array<{
 *   resume_version: string,
 *   total: number,
 *   responses: number,
 *   response_rate: number|null,
 *   has_enough_data: boolean,
 * }>} sorted by response_rate desc
 */
export function computeResponseRateByResumeVersion(opps) {
  const applied = opps.filter(isAppliedRecord);
  const map = {};

  for (const o of applied) {
    const version = o.resume_id_used ||
                    o.vault_recommended_resume_id ||
                    o.recommended_resume_version ||
                    'unknown';
    if (!map[version]) map[version] = { resume_version: version, total: 0, responses: 0 };
    map[version].total++;
    if (hasResponse(o)) map[version].responses++;
  }

  return Object.values(map)
    .map(s => ({
      ...s,
      response_rate:   pct(s.responses, s.total),
      has_enough_data: s.total >= MIN_SAMPLE_FOR_INSIGHT,
    }))
    .sort((a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1));
}

// ─── Response Rate by Role Lane ───────────────────────────────────────────────

/**
 * Compute response rates grouped by role lane.
 *
 * @param {Array} opps
 * @returns {Array<{
 *   lane: string,
 *   lane_label: string,
 *   total: number,
 *   responses: number,
 *   response_rate: number|null,
 *   has_enough_data: boolean,
 * }>} sorted by response_rate desc
 */
export function computeResponseRateByLane(opps) {
  const applied = opps.filter(isAppliedRecord);
  const map = {};

  for (const o of applied) {
    const lane = o.lane || 'other';
    if (!map[lane]) map[lane] = { lane, total: 0, responses: 0 };
    map[lane].total++;
    if (hasResponse(o)) map[lane].responses++;
  }

  return Object.values(map)
    .map(s => ({
      ...s,
      lane_label:      LANE_CONFIG[s.lane]?.label || s.lane,
      response_rate:   pct(s.responses, s.total),
      has_enough_data: s.total >= MIN_SAMPLE_FOR_INSIGHT,
    }))
    .sort((a, b) => (b.response_rate ?? -1) - (a.response_rate ?? -1));
}

// ─── Experiment Comparisons ───────────────────────────────────────────────────

/**
 * Run all structured experiment comparisons.
 *
 * Returns one entry per experiment type with:
 *   - type: EXPERIMENT_TYPE constant
 *   - label: human-readable label
 *   - result: raw comparison data
 *   - verdict: single-sentence conclusion
 *   - has_enough_data: boolean
 *
 * @param {Array} opps
 * @returns {Array<{ type, label, result, verdict, has_enough_data }>}
 */
export function runExperimentComparisons(opps) {
  const experiments = [];

  // ── Experiment 1: Outreach vs No Outreach ──────────────────────────────────
  const outreachRate = computeOutreachResponseRate(opps);
  const w  = outreachRate.withOutreach;
  const wo = outreachRate.withoutOutreach;
  experiments.push({
    type:  EXPERIMENT_TYPE.OUTREACH_VS_NONE,
    label: 'Outreach vs No Outreach',
    result: {
      with_outreach:    { count: w.count,  responses: w.responses,  response_rate: w.responseRate },
      without_outreach: { count: wo.count, responses: wo.responses, response_rate: wo.responseRate },
    },
    verdict:
      w.responseRate !== null && wo.responseRate !== null
        ? w.responseRate > wo.responseRate
          ? `Outreach is helping: ${w.responseRate}% vs ${wo.responseRate}% without (+${w.responseRate - wo.responseRate}pp)`
          : w.responseRate === wo.responseRate
            ? `No difference yet — need more data (${w.responseRate}% both ways)`
            : `Outreach not yet differentiated: ${w.responseRate}% with vs ${wo.responseRate}% without — review draft quality`
        : 'Insufficient data — send outreach on at least 3 applications to compare',
    has_enough_data: w.count >= MIN_SAMPLE_FOR_INSIGHT && wo.count >= MIN_SAMPLE_FOR_INSIGHT,
  });

  // ── Experiment 2: Direct Employer vs Intermediary ──────────────────────────
  const empTypes = computeResponseRateByEmployerType(opps);
  const d  = empTypes.direct;
  const im = empTypes.intermediary;
  experiments.push({
    type:  EXPERIMENT_TYPE.DIRECT_VS_INTERMEDIARY,
    label: 'Direct Employer vs Intermediary',
    result: { direct: d, intermediary: im },
    verdict:
      d.response_rate !== null && im.response_rate !== null
        ? d.response_rate > im.response_rate
          ? `Direct employers convert better: ${d.response_rate}% vs ${im.response_rate}% intermediary (+${d.response_rate - im.response_rate}pp)`
          : im.response_rate > d.response_rate
            ? `Intermediaries returning more responses: ${im.response_rate}% vs ${d.response_rate}% direct — unusual, verify data`
            : 'No difference detected between direct and intermediary'
        : d.total === 0 && im.total === 0
          ? 'No applied records yet'
          : 'Insufficient data in one or both groups — need 3+ applications per type',
    has_enough_data: d.has_enough_data && im.has_enough_data,
  });

  // ── Experiment 3: Source Family Comparison ─────────────────────────────────
  const sourceRates = computeResponseRateBySource(opps);
  const liveSources = sourceRates.filter(s => s.has_enough_data);
  if (liveSources.length >= 2) {
    const best  = liveSources[0];
    const worst = liveSources[liveSources.length - 1];
    experiments.push({
      type:  EXPERIMENT_TYPE.SOURCE_COMPARISON,
      label: 'Source Family Comparison',
      result: { rates: sourceRates },
      verdict: best.source_family !== worst.source_family
        ? `${best.source_family} converts best (${best.response_rate}%); ${worst.source_family} converts worst (${worst.response_rate}%)`
        : `Only one source has enough data: ${best.source_family} at ${best.response_rate}%`,
      has_enough_data: true,
    });
  } else {
    experiments.push({
      type:  EXPERIMENT_TYPE.SOURCE_COMPARISON,
      label: 'Source Family Comparison',
      result: { rates: sourceRates },
      verdict: `Need at least ${MIN_SAMPLE_FOR_INSIGHT} applications per source for reliable comparison`,
      has_enough_data: false,
    });
  }

  // ── Experiment 4: Resume Version Comparison ────────────────────────────────
  const resumeRates  = computeResponseRateByResumeVersion(opps);
  const liveResumes  = resumeRates.filter(r => r.has_enough_data);
  if (liveResumes.length >= 2) {
    const best  = liveResumes[0];
    const worst = liveResumes[liveResumes.length - 1];
    experiments.push({
      type:  EXPERIMENT_TYPE.RESUME_COMPARISON,
      label: 'Resume Version Comparison',
      result: { rates: resumeRates },
      verdict: best.resume_version !== worst.resume_version
        ? `${best.resume_version} converts best (${best.response_rate}%); ${worst.resume_version} converts worst (${worst.response_rate}%)`
        : `Only one resume version has enough data: ${best.resume_version} at ${best.response_rate}%`,
      has_enough_data: true,
    });
  } else {
    experiments.push({
      type:  EXPERIMENT_TYPE.RESUME_COMPARISON,
      label: 'Resume Version Comparison',
      result: { rates: resumeRates },
      verdict: `Need at least ${MIN_SAMPLE_FOR_INSIGHT} applications per resume version for reliable comparison`,
      has_enough_data: false,
    });
  }

  return experiments;
}

// ─── Zero-Conversion Warnings ─────────────────────────────────────────────────

/**
 * Get warning strings for sources and lanes with zero conversions
 * despite a meaningful sample size.
 *
 * @param {Array} opps
 * @returns {string[]}
 */
export function getZeroConversionWarnings(opps) {
  const warnings = [];
  const sourceRates = computeResponseRateBySource(opps);
  const laneRates   = computeResponseRateByLane(opps);

  for (const s of sourceRates) {
    if (s.has_enough_data && s.response_rate === 0) {
      warnings.push(`Zero-conversion source: ${s.source_family} — 0 responses from ${s.total} applications`);
    }
  }
  for (const l of laneRates) {
    if (l.total >= 5 && l.response_rate === 0) {
      warnings.push(`Zero-conversion lane: ${l.lane_label} — 0 responses from ${l.total} applications`);
    }
  }
  return warnings;
}

// ─── Decision Support ─────────────────────────────────────────────────────────

/**
 * Build a decision support summary answering three questions:
 *   - What should you keep doing?
 *   - What should you stop doing?
 *   - What should you test next?
 *
 * All conclusions are derived from real data in `opps`.
 * No AI inference. No vanity metrics.
 *
 * @param {Array} opps
 * @returns {{ keep: string[], stop: string[], test: string[] }}
 */
export function buildDecisionSupportSummary(opps) {
  const keep = [];
  const stop = [];
  const test = [];

  const funnel       = computeConversionFunnel(opps);
  const sourceRates  = computeResponseRateBySource(opps);
  const laneRates    = computeResponseRateByLane(opps);
  const empTypes     = computeResponseRateByEmployerType(opps);
  const outreachRate = computeOutreachResponseRate(opps);
  const zeroWarnings = getZeroConversionWarnings(opps);

  // ── Source signals ─────────────────────────────────────────────────────────
  for (const s of sourceRates) {
    if (!s.has_enough_data) continue;
    if (s.response_rate >= 30) {
      keep.push(`Keep ${s.source_family} — ${s.response_rate}% response rate (${s.total} applications)`);
    } else if (s.response_rate === 0) {
      stop.push(`Stop investing in ${s.source_family} — 0% response rate after ${s.total} applications`);
    } else if (s.response_rate < 10) {
      stop.push(`Consider pausing ${s.source_family} — only ${s.response_rate}% response rate (${s.total} applications)`);
    }
  }

  // ── Lane signals ───────────────────────────────────────────────────────────
  for (const l of laneRates) {
    if (!l.has_enough_data) continue;
    if (l.response_rate >= 30) {
      keep.push(`Lane '${l.lane_label}' is converting well (${l.response_rate}%)`);
    } else if (l.response_rate === 0 && l.total >= 5) {
      stop.push(`Lane '${l.lane_label}' has 0% response — reconsider time spent on this lane`);
    }
  }

  // ── Outreach signals ───────────────────────────────────────────────────────
  const w  = outreachRate.withOutreach;
  const wo = outreachRate.withoutOutreach;
  if (w.responseRate !== null && wo.responseRate !== null) {
    if (w.responseRate > wo.responseRate + 5) {
      keep.push(`Keep sending outreach — ${w.responseRate}% response with outreach vs ${wo.responseRate}% without`);
    } else if (w.responseRate < wo.responseRate) {
      test.push(`Review outreach draft quality — outreach is not improving response rate (${w.responseRate}% vs ${wo.responseRate}% without)`);
    } else {
      test.push(`Test more personalised outreach — current lift is small (${w.responseRate}% vs ${wo.responseRate}%)`);
    }
  } else if (w.count === 0 && funnel.applications_sent > 0) {
    test.push('Test outreach — no outreach sent yet; use recruiter outreach drafts in the Apply Pack');
  }

  // ── Employer type signals ──────────────────────────────────────────────────
  if (empTypes.direct.has_enough_data && empTypes.intermediary.has_enough_data) {
    if (empTypes.direct.response_rate > empTypes.intermediary.response_rate + 10) {
      keep.push(`Focus on direct employers — ${empTypes.direct.response_rate}% vs ${empTypes.intermediary.response_rate}% from intermediaries`);
    } else if (empTypes.intermediary.response_rate === 0 && empTypes.intermediary.total >= 3) {
      stop.push(`Pause intermediary applications — 0% response after ${empTypes.intermediary.total} attempts`);
    }
  }

  // ── Volume check ───────────────────────────────────────────────────────────
  if (funnel.applications_sent < MIN_SAMPLE_FOR_INSIGHT) {
    test.push(`Increase application volume to at least ${MIN_SAMPLE_FOR_INSIGHT} to generate reliable conversion data`);
  }

  // ── Zero conversions (any domain) ─────────────────────────────────────────
  if (funnel.applications_sent >= 5 && funnel.responses === 0) {
    test.push(`Zero responses from ${funnel.applications_sent} applications — review resume targeting and outreach quality`);
  }

  // Fallbacks
  if (keep.length === 0) keep.push('No strong keep signals yet — need more application data to compare');
  if (stop.length === 0) stop.push('No clear stop signals yet — keep building the pipeline');
  if (test.length === 0) test.push('Keep applying and tracking outcomes — insights emerge with 5+ applications per segment');

  return { keep, stop, test };
}
