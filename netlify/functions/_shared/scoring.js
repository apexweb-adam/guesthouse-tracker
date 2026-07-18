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
  'technical program manager',
  'tpm',
  'technology project manager',
  'it project manager',
  'senior it project manager',
  'digital project manager',
  'engineering project manager',
  'software project manager',
  'tech project manager',
  'it programme manager',
  'technology programme manager',
  'infrastructure project manager',
  'cybersecurity project manager',
  'security project manager',
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

// ─── Resume Versions ──────────────────────────────────────────────────────────

/**
 * Locked resume versions for Sample Candidate.
 * Only these versions are valid recommendations.
 */
export const RESUME_VERSIONS = {
  TPM: 'TPM-BASE-01',
  DELIVERY: 'DEL-BASE-01',
  OPS: 'OPS-COND-01',
  MASTER: 'MASTER-01',
};

export const RESUME_VERSION_LABELS = {
  [RESUME_VERSIONS.TPM]: 'Technical Project Manager — Base',
  [RESUME_VERSIONS.DELIVERY]: 'Delivery Manager — Base',
  [RESUME_VERSIONS.OPS]: 'Operations Manager — Conditional',
  [RESUME_VERSIONS.MASTER]: 'Master Resume (all-lane)',
};

/**
 * Recommend the best resume version for an opportunity.
 * Returns { version, confidence: 'high'|'medium'|'low', reason }.
 *
 * Rules (mirrors the candidate truth hierarchy):
 * - TPM-BASE-01 : TPM lane, any score; or MASTER when score is borderline
 * - DEL-BASE-01 : delivery_manager lane, score >= 60
 * - OPS-COND-01 : ops_manager lane (conditional — must have technical-ops signals)
 * - MASTER-01   : only when fit is genuinely multi-lane or score is ambiguous
 */
export function recommendResumeVersion(lane, score = 0, signals = []) {
  // TPM is always primary — strong evidence
  if (lane === LANES.TPM && score >= 80) {
    return {
      version: RESUME_VERSIONS.TPM,
      confidence: 'high',
      reason: `Strong TPM fit (score ${score}). TPM-BASE-01 leads with technical delivery, SDLC ownership, and stakeholder management. Do not dilute with ops or governance framing.`,
    };
  }
  if (lane === LANES.TPM && score >= 60) {
    return {
      version: RESUME_VERSIONS.TPM,
      confidence: 'medium',
      reason: `Moderate TPM fit (score ${score}). TPM-BASE-01 is still the correct base. Review description for technical delivery emphasis before submitting.`,
    };
  }
  if (lane === LANES.TPM) {
    return {
      version: RESUME_VERSIONS.MASTER,
      confidence: 'low',
      reason: `Weak TPM signals (score ${score}). MASTER-01 provides broader coverage; however, revisit whether this role is worth pursuing given low fit.`,
    };
  }

  // Delivery Manager — secondary
  if (lane === LANES.DELIVERY_MANAGER && score >= 70) {
    return {
      version: RESUME_VERSIONS.DELIVERY,
      confidence: 'high',
      reason: `Strong Delivery Manager fit (score ${score}). DEL-BASE-01 emphasises agile delivery cadence, sprint ownership, and team outcomes — the core ask for this role.`,
    };
  }
  if (lane === LANES.DELIVERY_MANAGER && score >= 55) {
    return {
      version: RESUME_VERSIONS.DELIVERY,
      confidence: 'medium',
      reason: `Moderate Delivery Manager fit (score ${score}). DEL-BASE-01 is correct; verify that agile/sprint delivery is central to the role before submitting.`,
    };
  }
  if (lane === LANES.DELIVERY_MANAGER) {
    return {
      version: RESUME_VERSIONS.MASTER,
      confidence: 'low',
      reason: `Weak Delivery Manager signals (score ${score}). Using MASTER-01 for broader coverage. Check if TPM-BASE-01 might actually be a better fit given the description.`,
    };
  }

  // Ops Manager — conditional only
  if (lane === LANES.OPS_MANAGER && score >= 65) {
    const hasTechOpsSignal = signals.some(s =>
      s.includes('readiness') || s.includes('compliance') || s.includes('tech-ops') || s.includes('technical')
    );
    if (hasTechOpsSignal) {
      return {
        version: RESUME_VERSIONS.OPS,
        confidence: 'high',
        reason: `Qualified Ops Manager role (score ${score}) with confirmed technical-ops signals. OPS-COND-01 emphasises readiness, compliance, and operational technical track record.`,
      };
    }
    return {
      version: RESUME_VERSIONS.OPS,
      confidence: 'medium',
      reason: `Ops Manager fit (score ${score}) without explicit technical-ops signals in scoring. OPS-COND-01 is the correct version; verify readiness/compliance scope is dominant before submitting.`,
    };
  }
  if (lane === LANES.OPS_MANAGER) {
    return {
      version: RESUME_VERSIONS.MASTER,
      confidence: 'low',
      reason: `Weak Ops Manager fit (score ${score}). This role may be too generic. MASTER-01 provides broad coverage but approach with caution — the role may not align with Candidate's target.`,
    };
  }

  // Program Manager — selective
  if (lane === LANES.PROGRAM_MANAGER && score >= 70) {
    return {
      version: RESUME_VERSIONS.MASTER,
      confidence: 'medium',
      reason: `Qualified Program Manager fit (score ${score}). MASTER-01 covers governance and portfolio scope. TPM-BASE-01 is not recommended for governance-heavy PgM roles.`,
    };
  }

  // All other cases — generic, other, low fit
  return {
    version: RESUME_VERSIONS.MASTER,
    confidence: 'low',
    reason: `Low fit or generic lane (${lane}, score ${score}). MASTER-01 is the fallback but consider whether this role warrants application at all.`,
  };
}
