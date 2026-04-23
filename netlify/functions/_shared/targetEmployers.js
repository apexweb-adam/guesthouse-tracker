/**
 * Target Employer Registry — netlify/functions/_shared/targetEmployers.js
 *
 * Structured registry of target employers for discovery prioritisation.
 * Used by the discovery layer to tag and surface direct employer roles
 * and to warn against low-signal intermediary/aggregator sources.
 *
 * This is a static registry. Not a live scraper. No PII. No automation.
 * No LinkedIn scraping. No auto-submit. Approval gate unchanged.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────

export const EMPLOYER_PRIORITY = {
  HIGH:   'high',    // Strong target — direct employer, relevant domain
  MEDIUM: 'medium',  // Moderate target — relevant domain, less certain fit
  LOW:    'low',     // Low priority — noisy or intermediary
};

export const EMPLOYER_TYPE = {
  DIRECT:       'direct',       // Company hires directly
  INTERMEDIARY: 'intermediary', // Staffing / recruiting firm (may mask end employer)
  AGGREGATOR:   'aggregator',   // Job board or aggregator (not an employer)
};

// ─── Target Employer Registry ──────────────────────────────────────────────────
//
// Fields:
//   id             — unique slug
//   name           — canonical display name
//   aliases        — alternate company name strings that appear on job boards
//   type           — EMPLOYER_TYPE constant
//   priority       — EMPLOYER_PRIORITY constant
//   source_families— which source families they post on
//   domain_tags    — relevant domain tags (informational)
//   federal        — true if federal/regulated environment employer
//   cloud          — true if cloud-delivery relevant
//   security       — true if cybersecurity/IAM relevant
//   notes          — human-readable note for the operator
//   active         — true = watch, false = paused/deprioritised

export const TARGET_EMPLOYER_REGISTRY = [

  // ── Federal IT Contractors ────────────────────────────────────────────────────

  {
    id: 'emp-leidos',
    name: 'Leidos',
    aliases: ['leidos holdings', 'leidos federal'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse', 'lever', 'usajobs'],
    domain_tags: ['federal', 'cybersecurity', 'cloud', 'IAM', 'FedRAMP'],
    federal: true, cloud: true, security: true,
    notes: 'Large federal IT contractor. Strong TPM/program delivery pipeline. Hires directly.',
    active: true,
  },
  {
    id: 'emp-saic',
    name: 'SAIC',
    aliases: ['science applications international', 'saic federal', 'science applications'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse', 'lever', 'usajobs'],
    domain_tags: ['federal', 'cybersecurity', 'cloud', 'IAM', 'FedRAMP'],
    federal: true, cloud: true, security: true,
    notes: 'Federal IT delivery. Consistent IT PM and TPM postings. Direct hire.',
    active: true,
  },
  {
    id: 'emp-booz-allen',
    name: 'Booz Allen Hamilton',
    aliases: ['booz allen', 'booz allen hamilton'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse', 'lever'],
    domain_tags: ['federal', 'cybersecurity', 'cloud', 'IAM', 'FedRAMP'],
    federal: true, cloud: true, security: true,
    notes: 'Top federal consulting firm. High demand for TPM and program managers.',
    active: true,
  },
  {
    id: 'emp-accenture-federal',
    name: 'Accenture Federal Services',
    aliases: ['accenture federal', 'accenture government services', 'accenture federal services'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse'],
    domain_tags: ['federal', 'cloud', 'digital_transformation', 'IAM'],
    federal: true, cloud: true, security: false,
    notes: 'Federal consulting. Cloud modernisation and digital transformation. Direct hire.',
    active: true,
  },
  {
    id: 'emp-deloitte',
    name: 'Deloitte',
    aliases: ['deloitte consulting', 'deloitte government', 'deloitte federal', 'deloitte llp'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse', 'lever'],
    domain_tags: ['federal', 'cloud', 'digital_transformation', 'enterprise_it'],
    federal: true, cloud: true, security: false,
    notes: 'Large consulting. Federal and commercial delivery PM/TPM roles.',
    active: true,
  },
  {
    id: 'emp-cgi-federal',
    name: 'CGI Federal',
    aliases: ['cgi federal', 'cgi group', 'cgi inc', 'cgi'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse'],
    domain_tags: ['federal', 'cloud', 'IAM', 'FedRAMP'],
    federal: true, cloud: true, security: true,
    notes: 'Federal IT contractor. Delivers cloud, IAM, and transformation for agencies including VA/IRS.',
    active: true,
  },
  {
    id: 'emp-mitre',
    name: 'MITRE',
    aliases: ['mitre corporation', 'the mitre corporation'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse'],
    domain_tags: ['federal', 'cybersecurity', 'IAM', 'FedRAMP'],
    federal: true, cloud: false, security: true,
    notes: 'Federal R&D nonprofit. Strong governance focus. TPM/program roles. Direct hire.',
    active: true,
  },
  {
    id: 'emp-mantech',
    name: 'ManTech',
    aliases: ['mantech international', 'mantech'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse', 'lever', 'usajobs'],
    domain_tags: ['federal', 'cybersecurity', 'cloud'],
    federal: true, cloud: true, security: true,
    notes: 'Federal IT and cyber. Delivery/PM roles. Often posts on Lever.',
    active: true,
  },
  {
    id: 'emp-peraton',
    name: 'Peraton',
    aliases: ['peraton inc', 'peraton federal'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse'],
    domain_tags: ['federal', 'cybersecurity', 'cloud'],
    federal: true, cloud: false, security: true,
    notes: 'Federal IT and national security. PM and technical PM roles.',
    active: true,
  },
  {
    id: 'emp-maximus',
    name: 'Maximus',
    aliases: ['maximus federal', 'maximus inc', 'maximus us'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse', 'lever'],
    domain_tags: ['federal', 'enterprise_it'],
    federal: true, cloud: false, security: false,
    notes: 'Federal IT and government services. PM/delivery roles. IRS/VA agency work.',
    active: true,
  },
  {
    id: 'emp-icf',
    name: 'ICF International',
    aliases: ['icf international', 'icf', 'icf next'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse'],
    domain_tags: ['federal', 'digital_transformation', 'enterprise_it'],
    federal: true, cloud: false, security: false,
    notes: 'Federal consulting and digital delivery. PM roles in tech-forward agencies.',
    active: true,
  },
  {
    id: 'emp-gdit',
    name: 'General Dynamics IT',
    aliases: ['general dynamics information technology', 'gdit', 'general dynamics it'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse', 'lever', 'usajobs'],
    domain_tags: ['federal', 'cybersecurity', 'cloud'],
    federal: true, cloud: true, security: true,
    notes: 'Federal IT delivery contractor. IT PM and program manager roles.',
    active: true,
  },

  // ── Cloud / Enterprise Tech ───────────────────────────────────────────────────

  {
    id: 'emp-aws',
    name: 'Amazon Web Services',
    aliases: ['aws', 'amazon web services', 'amazon'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.HIGH,
    source_families: ['greenhouse', 'lever'],
    domain_tags: ['cloud', 'enterprise_it', 'digital_transformation'],
    federal: false, cloud: true, security: false,
    notes: 'Cloud leader. TPM roles for cloud delivery, platform, and migrations.',
    active: true,
  },
  {
    id: 'emp-microsoft',
    name: 'Microsoft',
    aliases: ['microsoft corporation', 'microsoft federal', 'microsoft corp'],
    type: EMPLOYER_TYPE.DIRECT,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    source_families: ['greenhouse'],
    domain_tags: ['cloud', 'enterprise_it', 'IAM'],
    federal: false, cloud: true, security: false,
    notes: 'Cloud and enterprise. TPM/PM roles for Azure/M365 delivery.',
    active: true,
  },

  // ── Known Staffing / Intermediaries ──────────────────────────────────────────
  // Listed so they can be flagged in the approval queue and source quality reports.

  {
    id: 'emp-insight-global',
    name: 'Insight Global',
    aliases: ['insight global', 'insight global staffing'],
    type: EMPLOYER_TYPE.INTERMEDIARY,
    priority: EMPLOYER_PRIORITY.LOW,
    source_families: ['lever', 'greenhouse'],
    domain_tags: [],
    federal: false, cloud: false, security: false,
    notes: 'Staffing firm. Often posts client roles without naming end employer. Low signal.',
    active: true,
  },
  {
    id: 'emp-tek-systems',
    name: 'TEKsystems',
    aliases: ['teksystems', 'tek systems'],
    type: EMPLOYER_TYPE.INTERMEDIARY,
    priority: EMPLOYER_PRIORITY.LOW,
    source_families: ['lever', 'greenhouse'],
    domain_tags: [],
    federal: false, cloud: false, security: false,
    notes: 'IT staffing firm. Intermediary — may mask end client. Low signal for TPM roles.',
    active: true,
  },
  {
    id: 'emp-apex-systems',
    name: 'Apex Systems',
    aliases: ['apex systems', 'apex group'],
    type: EMPLOYER_TYPE.INTERMEDIARY,
    priority: EMPLOYER_PRIORITY.LOW,
    source_families: ['lever'],
    domain_tags: [],
    federal: false, cloud: false, security: false,
    notes: 'IT staffing. Intermediary — roles often have unclear scope.',
    active: true,
  },
  {
    id: 'emp-client-server',
    name: 'Client Server',
    aliases: ['client server ltd', 'clientserver'],
    type: EMPLOYER_TYPE.INTERMEDIARY,
    priority: EMPLOYER_PRIORITY.LOW,
    source_families: ['lever', 'greenhouse'],
    domain_tags: [],
    federal: false, cloud: false, security: false,
    notes: 'IT staffing intermediary. Low signal — roles often generic or salary-suppressed.',
    active: true,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up employer metadata by company name (case-insensitive).
 * Checks both `name` and `aliases`.
 * Returns the matching registry entry or null.
 */
export function getEmployerMeta(companyName) {
  if (!companyName) return null;
  const lower = companyName.toLowerCase().trim();
  return TARGET_EMPLOYER_REGISTRY.find(e =>
    e.active && (
      e.name.toLowerCase() === lower ||
      (e.aliases || []).some(a =>
        lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower)
      )
    )
  ) || null;
}

/**
 * Returns true if the company is a known target employer.
 */
export function isTargetEmployer(companyName) {
  return getEmployerMeta(companyName) !== null;
}

/**
 * Returns EMPLOYER_TYPE for a company, or null if not in registry.
 */
export function classifyEmployerType(companyName) {
  const meta = getEmployerMeta(companyName);
  return meta ? meta.type : null;
}

/**
 * Returns true if employer is a known intermediary/staffing firm.
 */
export function isIntermediaryEmployer(companyName) {
  return classifyEmployerType(companyName) === EMPLOYER_TYPE.INTERMEDIARY;
}

/**
 * Returns active target employers sorted by priority (high → medium → low).
 */
export function getActiveTargetEmployers() {
  const order = {
    [EMPLOYER_PRIORITY.HIGH]: 0,
    [EMPLOYER_PRIORITY.MEDIUM]: 1,
    [EMPLOYER_PRIORITY.LOW]: 2,
  };
  return TARGET_EMPLOYER_REGISTRY
    .filter(e => e.active)
    .sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

/**
 * Returns active direct (non-intermediary) target employers by priority.
 */
export function getActiveDirectTargetEmployers() {
  return getActiveTargetEmployers().filter(e => e.type === EMPLOYER_TYPE.DIRECT);
}

/**
 * Returns active intermediary/staffing employers.
 */
export function getKnownIntermediaries() {
  return TARGET_EMPLOYER_REGISTRY
    .filter(e => e.active && e.type === EMPLOYER_TYPE.INTERMEDIARY);
}

/**
 * Compute quality signals for a set of opportunities from a given employer.
 * Returns: { total, recommended, recommendedRate, highFitCount, junkRate, responseReadyCount }
 * or null if no matching opportunities exist.
 */
export function computeEmployerQualitySignals(opps, companyName) {
  const lower = (companyName || '').toLowerCase();
  const employerOpps = opps.filter(o =>
    (o.company || '').toLowerCase().includes(lower)
  );
  if (employerOpps.length === 0) return null;

  const total = employerOpps.length;
  const recommended = employerOpps.filter(o => o.recommended).length;
  const highFit = employerOpps.filter(o => (o.fit_score || 0) >= 85).length;
  const responseReady = employerOpps.filter(o =>
    o.approval_state === 'approved' && (o.application_url || o.canonical_job_url)
  ).length;

  return {
    total,
    recommended,
    recommendedRate: Math.round((recommended / total) * 100),
    highFitCount: highFit,
    junkRate: Math.round(((total - recommended) / total) * 100),
    responseReadyCount: responseReady,
  };
}

/**
 * Compute source-level quality warnings based on ingested opportunities.
 *
 * Returns an array of warning codes:
 *   'zero_yield'         — source has produced no opportunities
 *   'high_junk'          — > 60 % of roles are low-fit
 *   'noisy'              — >= 5 records and > 50 % low-fit
 *   'stale_board'        — > 50 % of records are older than 30 days
 *   'intermediary_heavy' — > 40 % of records are from known staffing firms
 */
export function getSourceQualityWarnings(sourceFamily, opps) {
  const warnings = [];
  const sfOpps = opps.filter(o => (o.source_family || 'manual') === sourceFamily);

  if (sfOpps.length === 0) {
    warnings.push('zero_yield');
    return warnings;
  }

  const recommended = sfOpps.filter(o => o.recommended).length;
  const junkRate = Math.round(((sfOpps.length - recommended) / sfOpps.length) * 100);

  if (junkRate > 60) warnings.push('high_junk');
  if (sfOpps.length >= 5 && junkRate > 50) warnings.push('noisy');

  // Stale board: more than half of records older than 30 days
  const staleCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const stale = sfOpps.filter(o => (o.discovered_at || o.ingested_at || '') < staleCutoff);
  if (stale.length > sfOpps.length * 0.5) warnings.push('stale_board');

  // Intermediary-heavy: more than 40 % of roles from known staffing firms
  const intermediaryCount = sfOpps.filter(o => isIntermediaryEmployer(o.company)).length;
  if (intermediaryCount > sfOpps.length * 0.4) warnings.push('intermediary_heavy');

  return warnings;
}

/**
 * Returns a human-readable label for a warning code.
 */
export const SOURCE_WARNING_LABELS = {
  zero_yield:          '⚠ Zero yield — no opportunities ingested from this source yet',
  high_junk:           '⚠ High junk rate (>60% low-fit) — review source config',
  noisy:               '⚠ Noisy — >50% low-fit with 5+ records',
  stale_board:         '⚠ Stale board — >50% of records are 30+ days old',
  intermediary_heavy:  '⚠ Intermediary-heavy — >40% of roles are from staffing firms',
};

/**
 * Build a signal summary for a job opportunity for use in the approval queue.
 * Returns an array of signal objects: { type, label, color, bg }
 */
export function buildApprovalQueueSignals(opp) {
  const signals = [];
  const meta = getEmployerMeta(opp.company);

  if (meta) {
    if (meta.type === EMPLOYER_TYPE.DIRECT) {
      signals.push({
        type: 'direct_employer',
        label: '✓ Direct employer',
        color: '#15803d',
        bg: '#dcfce7',
      });
    } else if (meta.type === EMPLOYER_TYPE.INTERMEDIARY) {
      signals.push({
        type: 'staffing_intermediary',
        label: '⚙ Staffing / intermediary',
        color: '#92400e',
        bg: '#fef3c7',
      });
    }
    if (meta.federal) {
      signals.push({
        type: 'federal_regulated',
        label: '🏛 Federal / regulated',
        color: '#1d4ed8',
        bg: '#eff6ff',
      });
    }
    if (meta.security) {
      signals.push({
        type: 'security_iam',
        label: '🔒 Security / IAM',
        color: '#7c3aed',
        bg: '#f5f3ff',
      });
    }
  } else {
    // Unknown employer — flag as possible aggregator noise if fit is low
    if ((opp.fit_score || 0) < 50 && !opp.recommended) {
      signals.push({
        type: 'low_signal_noise',
        label: '📉 Low-signal / likely noise',
        color: '#6b7280',
        bg: '#f3f4f6',
      });
    }
  }

  return signals;
}
