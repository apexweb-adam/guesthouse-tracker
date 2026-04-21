/**
 * Preparation Package Logic
 *
 * Generates keyword mirror list, resume emphasis direction, proof points,
 * outreach drafts, and next-action guidance for an approved opportunity.
 *
 * Single source of truth: scoring lives in scoring.js. Prep lives here.
 * Do NOT re-implement this in n8n, Zapier, or the frontend directly.
 */

import { LANES, LANE_CONFIG, getRecommendation } from './scoring.js';

// ─── Keyword Extraction ───────────────────────────────────────────────────────

const COMMON_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'it',
  'your', 'our', 'their', 'its', 'my', 'as', 'up', 'if', 'into', 'about',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'each', 'such', 'both', 'other', 'more', 'also', 'than', 'then', 'so',
  'not', 'no', 'nor', 'what', 'which', 'who', 'when', 'where', 'how',
  'all', 'any', 'some', 'including', 'across', 'within', 'well',
]);

/**
 * Extract meaningful keywords from a job description for the mirror list.
 * Returns deduplicated lowercase terms sorted by frequency.
 */
export function extractKeywords(text = '') {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s\-/]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length >= 4 && !COMMON_STOPWORDS.has(w));

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  // Extract bigrams (two-word phrases)
  const tokens = normalized.split(/\s+/);
  const bigramFreq = {};
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.length >= 3 && b.length >= 3 && !COMMON_STOPWORDS.has(a) && !COMMON_STOPWORDS.has(b)) {
      const bg = `${a} ${b}`;
      bigramFreq[bg] = (bigramFreq[bg] || 0) + 1;
    }
  }

  const topWords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);

  const topBigrams = Object.entries(bigramFreq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([bg]) => bg);

  return [...new Set([...topBigrams, ...topWords])].slice(0, 20);
}

// ─── Lane-Specific Proof Points ───────────────────────────────────────────────

const PROOF_POINTS = {
  [LANES.TPM]: [
    'Led end-to-end technical delivery of [project] from scoping through deployment',
    'Managed SDLC for [system] — requirements, design, build, test, release',
    'Drove stakeholder alignment across engineering, product, and ops teams',
    'Delivered [project] on time and within budget using Agile/Scrum',
    'Maintained technical roadmap and risk register for [programme]',
    'Coordinated cross-functional delivery teams of [X] engineers',
    'Resolved technical blockers escalated from delivery teams',
    'Maintained sprint velocity and release cadence using Jira/Confluence',
  ],
  [LANES.DELIVERY_MANAGER]: [
    'Led Agile delivery across [X] squads using SAFe/Scrum/Kanban',
    'Owned sprint planning, retrospectives, and delivery cadence',
    'Established and maintained release management processes',
    'Improved team velocity by [X]% through process optimisation',
    'Facilitated cross-squad dependency resolution and planning sessions',
    'Delivered [X] releases per quarter with [Y]% on-time rate',
    'Coached teams on Agile practices and continuous improvement',
  ],
  [LANES.OPS_MANAGER]: [
    'Managed technical operations and ITSM processes for [environment]',
    'Led operational readiness reviews for [platform/system] releases',
    'Drove compliance and audit readiness across [X] systems',
    'Maintained service management framework (ITIL/ITSM)',
    'Reduced incident response time by [X]% through process improvement',
    'Ensured operational continuity across [X] environments',
    'Managed technology operations team of [X] across [Y] sites',
  ],
  [LANES.PROGRAM_MANAGER]: [
    'Governed enterprise programme of [X] workstreams and [$Y] budget',
    'Established PMO framework and governance reporting cadence',
    'Delivered digital transformation programme across [X] business units',
    'Maintained portfolio-level risk register and board reporting',
    'Led programme governance for [X]-year strategic initiative',
    'Coordinated cross-functional programme steering committee',
    'Managed programme interdependencies and dependency resolution',
  ],
  [LANES.GENERIC_PM]: [
    'Managed project lifecycle from initiation through closure',
    'Coordinated cross-functional project teams and stakeholder reporting',
  ],
  [LANES.OTHER]: [
    'Managed project delivery and team coordination',
  ],
};

// ─── Lane-Specific Summary Direction ─────────────────────────────────────────

const SUMMARY_DIRECTION = {
  [LANES.TPM]: 'Open with your technical delivery track record — SDLC ownership, engineering collaboration, and platform complexity. Centre your narrative on bridging technical and business delivery. Lead with the most complex or high-stakes project. Quantify scope (team size, budget, timeline, systems impacted).',
  [LANES.DELIVERY_MANAGER]: 'Open with your Agile/SAFe delivery leadership — squad ownership, release cadence, and continuous improvement outcomes. Emphasise your role enabling engineering teams to deliver predictably. Include a headline metric (velocity, release frequency, on-time delivery rate).',
  [LANES.OPS_MANAGER]: 'Open with your technical operations leadership — ITSM, readiness, compliance, or service management. Emphasise how you have kept complex technical environments stable and audit-ready. Include a headline incident, uptime, or compliance metric.',
  [LANES.PROGRAM_MANAGER]: 'Open with your programme governance and PMO experience — portfolio scope, board reporting, and governance structure. Centre your narrative on enterprise-scale coordination and risk management. Include headline scope (number of workstreams, total budget, business units spanned).',
  [LANES.GENERIC_PM]: 'Only pursue this if seniority, compensation, or industry domain makes it compelling. If applying, lead with the most technically credible project and avoid generic PM framing.',
  [LANES.OTHER]: 'This role does not closely match your target lanes. Only pursue if there is a clear and specific reason.',
};

// ─── Outreach Templates ───────────────────────────────────────────────────────

function buildRecruiterOutreach(opp) {
  const laneLabel = LANE_CONFIG[opp.lane]?.label || opp.lane;
  return `Hi [Recruiter Name],

I came across the ${opp.title} role at ${opp.company || '[Company]'} and wanted to reach out directly.

I am a ${laneLabel} with [X] years of experience delivering [key domain] programmes in [relevant industry/environment]. I have particular strength in [2–3 key skills from the job description].

I would welcome a brief conversation to see if there is a mutual fit. Are you available for a call this week?

Kind regards,
Sample Candidate`;
}

function buildHiringManagerOutreach(opp) {
  const laneLabel = LANE_CONFIG[opp.lane]?.label || opp.lane;
  return `Hi [Hiring Manager Name],

I am reaching out regarding the ${opp.title} opportunity at ${opp.company || '[Company]'}. I have been following [Company]'s work in [relevant area] and believe my background aligns well with what you are building.

In my most recent role, I [one-line achievement directly relevant to the job description]. I am specifically drawn to this role because of [specific aspect of the role or company that is genuinely relevant].

I would welcome a brief conversation if you are open to it.

Best regards,
Sample Candidate`;
}

// ─── Next Action Generator ────────────────────────────────────────────────────

function getNextAction(opp) {
  const { approval_state, status, fit_score } = opp;

  if (approval_state === 'pending') {
    return { action: 'Review and approve or reject in the Approval Queue', priority: 'high' };
  }
  if (status === 'approved' || approval_state === 'approved') {
    if (fit_score >= 80) {
      return { action: 'Prepare tailored resume using the resume emphasis below, then submit application', priority: 'high' };
    }
    return { action: 'Review fit signals, tailor resume and cover letter, then submit application', priority: 'medium' };
  }
  if (status === 'applied') {
    return { action: 'Follow up with recruiter if no response after 14 days', priority: 'medium' };
  }
  if (status === 'interviewing') {
    return { action: 'Prepare for next interview stage — review proof points and STAR examples', priority: 'high' };
  }
  return { action: 'No immediate action required', priority: 'low' };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Generate a preparation package for an opportunity.
 * @param {object} opp - opportunity record
 * @returns {object} prep package
 */
export function generatePrepPackage(opp) {
  const keywords = extractKeywords(`${opp.title || ''} ${opp.description || ''}`);
  const proofPoints = PROOF_POINTS[opp.lane] || PROOF_POINTS[LANES.OTHER];
  const summaryDirection = SUMMARY_DIRECTION[opp.lane] || SUMMARY_DIRECTION[LANES.OTHER];
  const laneConfig = LANE_CONFIG[opp.lane] || {};
  const recommendation = getRecommendation(opp.lane, opp.fit_score);
  const nextAction = getNextAction(opp);

  return {
    opportunityId: opp.id,
    title: opp.title,
    company: opp.company,
    lane: opp.lane,
    laneLabel: laneConfig.label || opp.lane,
    fitScore: opp.fit_score,
    resumeEmphasis: opp.resume_emphasis || laneConfig.resumeEmphasis,
    keywordMirrorList: keywords,
    proofPointsToSurface: proofPoints,
    summaryDirection,
    recommendation,
    nextAction,
    outreach: {
      recruiterDraft: buildRecruiterOutreach(opp),
      hiringManagerDraft: buildHiringManagerOutreach(opp),
    },
    fitSignals: opp.fit_signals || [],
    generatedAt: new Date().toISOString(),
  };
}

// ─── Outbound Event Dispatcher ────────────────────────────────────────────────
/**
 * Fire an outbound webhook event to the configured destination.
 *
 * Uses the same env var convention as webhooks.js:
 *   WEBHOOK_URL_<EVENT_UPPER>  — per-event destination
 *   WEBHOOK_URL               — catch-all destination
 *   WEBHOOK_SECRET            — optional X-Webhook-Secret header
 *
 * Safe by default: if no URL is configured, does nothing (no throw).
 * Callers should .catch(() => {}) to suppress any network errors.
 *
 * @param {string} eventName - e.g. 'discovery_run_complete', 'apply_pack_generated'
 * @param {object} payload   - event-specific data
 */
export async function fireEvent(eventName, payload = {}) {
  if (typeof process === 'undefined') return; // browser-safe no-op
  const eventKey = eventName.toUpperCase().replace(/-/g, '_');
  const url = process.env[`WEBHOOK_URL_${eventKey}`] || process.env.WEBHOOK_URL;
  if (!url) return; // no destination configured — safe no-op

  const secret = process.env.WEBHOOK_SECRET;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Webhook-Secret'] = secret;

  await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ event: eventName, payload, fired_at: new Date().toISOString() }),
  }).then(res => {
    if (!res.ok) {
      console.warn(`[fireEvent] webhook delivery failed for "${eventName}": HTTP ${res.status} → ${url}`);
    }
  });
}
