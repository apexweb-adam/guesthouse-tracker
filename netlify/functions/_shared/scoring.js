/**
 * CORE BUSINESS LOGIC — Scoring, Classification, Recommendation
 *
 * Sample Candidate — Locked Hierarchy (non-negotiable):
 *   1. Technical Project Manager (TPM)  — PRIMARY
 *   2. Delivery Manager                 — SECONDARY
 *   3. Operations Manager               — CONDITIONAL (technical-ops/readiness/compliance only)
 *   4. Program Manager                  — SELECTIVE (governance-heavy technical scope only)
 *   Generic PM / generic Ops            — LOW FIT
 *
 * This file is the single source of truth for all scoring logic.
 * Do NOT re-implement this logic in n8n, the frontend, or elsewhere.
 * Import this module from Netlify Functions and (for display) from the frontend.
 */

// ─── Lane Definitions ────────────────────────────────────────────────────────

export const LANES = {
  TPM: 'tpm',
  DELIVERY_MANAGER: 'delivery_manager',
  OPS_MANAGER: 'ops_manager',
  PROGRAM_MANAGER: 'program_manager',
  GENERIC_PM: 'generic_pm',
  OTHER: 'other',
};

export const LANE_CONFIG = {
  [LANES.TPM]: {
    label: 'Technical Project Manager',
    short: 'TPM',
    color: '#1a56db',
    maxScore: 100,
    resumeEmphasis: 'tpm',
  },
  [LANES.DELIVERY_MANAGER]: {
    label: 'Delivery Manager',
    short: 'DM',
    color: '#0694a2',
    maxScore: 92,
    resumeEmphasis: 'delivery',
  },
  [LANES.OPS_MANAGER]: {
    label: 'Operations Manager (Conditional)',
    short: 'Ops',
    color: '#c27803',
    maxScore: 75,
    resumeEmphasis: 'ops',
  },
  [LANES.PROGRAM_MANAGER]: {
    label: 'Program Manager (Selective)',
    short: 'PgM',
    color: '#7e3af2',
    maxScore: 80,
    resumeEmphasis: 'program',
  },
  [LANES.GENERIC_PM]: {
    label: 'Generic PM / Ops',
    short: 'Generic',
    color: '#9ca3af',
    maxScore: 40,
    resumeEmphasis: 'tpm',
  },
  [LANES.OTHER]: {
    label: 'Other',
    short: 'Other',
    color: '#6b7280',
    maxScore: 20,
    resumeEmphasis: 'tpm',
  },
};

// ─── Signal Libraries ─────────────────────────────────────────────────────────

const TPM_TITLE_SIGNALS = [
  'technical project manager',
  'technical programme manager',
  'tpm',
  'technology project manager',
  'it project manager',
  'digital project manager',
  'engineering project manager',
  'software project manager',
  'tech project manager',
  'it programme manager',
  'technology programme manager',
];

const TPM_DESC_SIGNALS = [
  'technical delivery',
  'engineering delivery',
  'technology delivery',
  'software delivery',
  'it project',
  'digital transformation',
  'system implementation',
  'platform delivery',
  'agile delivery lead',
  'scrum delivery',
  'sdlc',
  'technical roadmap',
];

const DELIVERY_TITLE_SIGNALS = [
  'delivery manager',
  'delivery lead',
  'agile delivery manager',
  'agile delivery lead',
  'release manager',
  'release train engineer',
  'rte',
  'sprint manager',
];

const DELIVERY_DESC_SIGNALS = [
  'agile delivery',
  'sprint planning',
  'release management',
  'delivery cadence',
  'team delivery',
  'end-to-end delivery',
  'safe agile',
  'scaled agile',
];

// Operations Manager qualifiers — MUST have at least one of these to qualify
const OPS_QUALIFIER_SIGNALS = [
  'technical operations',
  'it operations',
  'digital operations',
  'readiness',
  'compliance',
  'service operations',
  'itsm',
  'service management',
  'operational readiness',
  'infrastructure operations',
  'technology operations',
  'systems operations',
];

const OPS_TITLE_SIGNALS = [
  'operations manager',
  'ops manager',
  'technical operations manager',
  'it operations manager',
  'service operations manager',
];

// Program Manager qualifiers — MUST have at least one of these to qualify
const PGM_QUALIFIER_SIGNALS = [
  'governance',
  'pmo',
  'portfolio',
  'enterprise',
  'programme governance',
  'program governance',
  'transformation programme',
  'digital transformation programme',
  'strategic programme',
];

const PGM_TITLE_SIGNALS = [
  'program manager',
  'programme manager',
  'senior program manager',
  'senior programme manager',
  'technical program manager',
];

const GENERIC_PM_TITLE_SIGNALS = [
  'project manager',
  'project lead',
  'project coordinator',
  'project officer',
];

// Methodology / tool signals (additive score boosters)
const METHODOLOGY_SIGNALS = [
  { pattern: 'agile', score: 4 },
  { pattern: 'scrum', score: 4 },
  { pattern: 'kanban', score: 3 },
  { pattern: 'jira', score: 3 },
  { pattern: 'confluence', score: 2 },
  { pattern: 'pmp', score: 5 },
  { pattern: 'prince2', score: 5 },
  { pattern: 'safe ', score: 4 },
  { pattern: 'scaled agile', score: 4 },
  { pattern: 'stakeholder management', score: 4 },
  { pattern: 'cross-functional', score: 3 },
  { pattern: 'cross functional', score: 3 },
  { pattern: 'risk management', score: 3 },
  { pattern: 'budget management', score: 3 },
  { pattern: 'resource management', score: 2 },
  { pattern: 'azure devops', score: 4 },
  { pattern: 'ms project', score: 3 },
  { pattern: 'smartsheet', score: 3 },
];

const SENIORITY_SIGNALS = ['senior', 'lead', 'principal', 'head of', 'director', 'vp', 'vice president'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesAny(text, signals) {
  const n = normalize(text);
  return signals.some(s => n.includes(normalize(s)));
}

function matchCount(text, signals) {
  const n = normalize(text);
  return signals.filter(s => n.includes(normalize(s))).length;
}

function matchedSignals(text, signals) {
  const n = normalize(text);
  return signals.filter(s => n.includes(normalize(s)));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify an opportunity into a lane.
 * Returns { lane, laneConfig, signals[] }
 */
export function classifyLane(title = '', description = '') {
  const fullText = `${title} ${description}`;

  // TPM — PRIMARY: title match is sufficient, or strong desc + tech signals
  if (matchesAny(title, TPM_TITLE_SIGNALS)) {
    return {
      lane: LANES.TPM,
      laneConfig: LANE_CONFIG[LANES.TPM],
      signals: matchedSignals(title, TPM_TITLE_SIGNALS),
      method: 'title-match',
    };
  }
  if (matchCount(fullText, TPM_DESC_SIGNALS) >= 2) {
    return {
      lane: LANES.TPM,
      laneConfig: LANE_CONFIG[LANES.TPM],
      signals: matchedSignals(fullText, TPM_DESC_SIGNALS),
      method: 'desc-match',
    };
  }

  // Delivery Manager — SECONDARY
  if (matchesAny(title, DELIVERY_TITLE_SIGNALS)) {
    return {
      lane: LANES.DELIVERY_MANAGER,
      laneConfig: LANE_CONFIG[LANES.DELIVERY_MANAGER],
      signals: matchedSignals(title, DELIVERY_TITLE_SIGNALS),
      method: 'title-match',
    };
  }
  if (matchCount(fullText, DELIVERY_DESC_SIGNALS) >= 2) {
    return {
      lane: LANES.DELIVERY_MANAGER,
      laneConfig: LANE_CONFIG[LANES.DELIVERY_MANAGER],
      signals: matchedSignals(fullText, DELIVERY_DESC_SIGNALS),
      method: 'desc-match',
    };
  }

  // Program Manager — SELECTIVE (must have governance qualifiers)
  if (matchesAny(title, PGM_TITLE_SIGNALS)) {
    const hasQualifiers = matchesAny(fullText, PGM_QUALIFIER_SIGNALS);
    if (hasQualifiers) {
      return {
        lane: LANES.PROGRAM_MANAGER,
        laneConfig: LANE_CONFIG[LANES.PROGRAM_MANAGER],
        signals: matchedSignals(fullText, PGM_QUALIFIER_SIGNALS),
        method: 'title+qualifier',
      };
    }
    // Program Manager without governance qualifier → generic
    return {
      lane: LANES.GENERIC_PM,
      laneConfig: LANE_CONFIG[LANES.GENERIC_PM],
      signals: ['program manager — no governance qualifier detected'],
      method: 'downgraded-no-qualifier',
    };
  }

  // Operations Manager — CONDITIONAL (must have technical qualifier)
  if (matchesAny(title, OPS_TITLE_SIGNALS)) {
    const hasQualifiers = matchesAny(fullText, OPS_QUALIFIER_SIGNALS);
    if (hasQualifiers) {
      return {
        lane: LANES.OPS_MANAGER,
        laneConfig: LANE_CONFIG[LANES.OPS_MANAGER],
        signals: matchedSignals(fullText, OPS_QUALIFIER_SIGNALS),
        method: 'title+qualifier',
      };
    }
    // Ops Manager without technical qualifier → low fit
    return {
      lane: LANES.GENERIC_PM,
      laneConfig: LANE_CONFIG[LANES.GENERIC_PM],
      signals: ['operations manager — no technical qualifier detected'],
      method: 'downgraded-no-qualifier',
    };
  }

  // Generic PM fallback
  if (matchesAny(title, GENERIC_PM_TITLE_SIGNALS)) {
    return {
      lane: LANES.GENERIC_PM,
      laneConfig: LANE_CONFIG[LANES.GENERIC_PM],
      signals: matchedSignals(title, GENERIC_PM_TITLE_SIGNALS),
      method: 'title-match',
    };
  }

  return {
    lane: LANES.OTHER,
    laneConfig: LANE_CONFIG[LANES.OTHER],
    signals: [],
    method: 'no-match',
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a job opportunity for Sample Candidate.
 * Returns { score (0-100), lane, signals[], resumeEmphasis, recommended }
 */
export function scoreOpportunity(title = '', description = '', seniority = '') {
  const { lane, laneConfig, signals, method } = classifyLane(title, description);
  const fullText = `${title} ${description} ${seniority}`;

  let score = 0;
  const scoreSignals = [...signals];

  // Base score from lane ceiling
  // We scale within the lane's max, so a perfect TPM role can reach 100
  // while a perfect Ops role can reach max 75.
  const laneCeiling = laneConfig.maxScore;

  // Title match bonus (up to 30 points before ceiling)
  let titleBonus = 0;
  if (lane === LANES.TPM && matchesAny(title, TPM_TITLE_SIGNALS)) {
    titleBonus = 30;
    scoreSignals.push('title: TPM exact/partial match');
  } else if (lane === LANES.DELIVERY_MANAGER && matchesAny(title, DELIVERY_TITLE_SIGNALS)) {
    titleBonus = 28;
    scoreSignals.push('title: Delivery Manager match');
  } else if (lane === LANES.OPS_MANAGER && matchesAny(title, OPS_TITLE_SIGNALS)) {
    titleBonus = 20;
    scoreSignals.push('title: Ops Manager qualified match');
  } else if (lane === LANES.PROGRAM_MANAGER && matchesAny(title, PGM_TITLE_SIGNALS)) {
    titleBonus = 22;
    scoreSignals.push('title: Program Manager qualified match');
  } else if (method === 'desc-match') {
    titleBonus = 15;
    scoreSignals.push('desc-match: strong description signals');
  } else {
    titleBonus = 5;
  }

  // Description keyword density (up to 20 points)
  const descSignalCount =
    matchCount(fullText, TPM_DESC_SIGNALS) +
    matchCount(fullText, DELIVERY_DESC_SIGNALS) +
    matchCount(fullText, OPS_QUALIFIER_SIGNALS) +
    matchCount(fullText, PGM_QUALIFIER_SIGNALS);

  const descBonus = Math.min(20, descSignalCount * 3);
  if (descBonus > 0) {
    scoreSignals.push(`desc keywords: ${descSignalCount} signal(s) found (+${descBonus})`);
  }

  // Methodology / tool signals (up to 20 points)
  let methodologyBonus = 0;
  for (const { pattern, score: pts } of METHODOLOGY_SIGNALS) {
    if (normalize(fullText).includes(pattern)) {
      methodologyBonus += pts;
      scoreSignals.push(`tool/method: ${pattern}`);
    }
  }
  methodologyBonus = Math.min(20, methodologyBonus);

  // Seniority match (up to 10 points)
  const seniorityBonus = matchesAny(fullText, SENIORITY_SIGNALS) ? 10 : 0;
  if (seniorityBonus) scoreSignals.push('seniority: senior/lead/principal signal found');

  // Raw score
  const rawScore = titleBonus + descBonus + methodologyBonus + seniorityBonus;

  // Apply lane ceiling as a hard cap
  // Scale: rawScore can be at most ~80 (30+20+20+10)
  // We scale so 80 raw maps to laneCeiling
  const scaled = (rawScore / 80) * laneCeiling;
  score = clamp(scaled, lane === LANES.OTHER ? 0 : 5, laneCeiling);

  const recommended = score >= 70;
  const highFit = score >= 85;

  return {
    score,
    lane,
    laneConfig,
    signals: [...new Set(scoreSignals)],
    resumeEmphasis: laneConfig.resumeEmphasis,
    recommended,
    highFit,
  };
}

// ─── Recommendation Logic ──────────────────────────────────────────────────────

/**
 * Return recommended prep guidance based on lane and score.
 */
export function getRecommendation(lane, score) {
  if (score < 30) return 'Not recommended — low fit, consider skipping.';
  if (score < 50) return 'Low fit — only pursue if seniority and description warrant it.';
  if (score < 70) {
    const guidance = {
      [LANES.TPM]: 'Moderate TPM fit — review description for technical delivery emphasis.',
      [LANES.DELIVERY_MANAGER]: 'Moderate Delivery Manager fit — verify agile/sprint ownership is central.',
      [LANES.OPS_MANAGER]: 'Conditional Ops fit — confirm technical readiness/compliance scope is dominant.',
      [LANES.PROGRAM_MANAGER]: 'Selective PgM fit — verify governance and PMO scope before applying.',
      [LANES.GENERIC_PM]: 'Low fit — generic role, de-prioritise unless seniority or domain is compelling.',
      [LANES.OTHER]: 'Low fit — does not match target lanes.',
    };
    return guidance[lane] || 'Low-moderate fit — review carefully.';
  }
  const guidance = {
    [LANES.TPM]: 'Strong TPM fit — lead with technical delivery, stakeholder management, and SDLC ownership.',
    [LANES.DELIVERY_MANAGER]: 'Strong Delivery Manager fit — emphasise agile delivery cadence and team outcomes.',
    [LANES.OPS_MANAGER]: 'Qualified Ops fit — emphasise readiness, compliance, and technical operations track record.',
    [LANES.PROGRAM_MANAGER]: 'Qualified PgM fit — emphasise governance, PMO, and portfolio-level delivery.',
    [LANES.GENERIC_PM]: 'Approve cautiously — generic PM role; only submit if seniority/pay justifies.',
    [LANES.OTHER]: 'Uncertain fit — manual review required.',
  };
  return guidance[lane] || 'Strong fit — proceed with approval.';
}

/**
 * Return resume emphasis label for display.
 */
export function getResumeEmphasisLabel(emphasis) {
  const map = {
    tpm: 'Technical PM emphasis',
    delivery: 'Delivery Manager emphasis',
    ops: 'Ops/Readiness emphasis',
    program: 'Programme Governance emphasis',
  };
  return map[emphasis] || emphasis;
}
