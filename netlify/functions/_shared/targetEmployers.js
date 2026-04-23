/**
 * Target Employer Registry — _shared/targetEmployers.js
 *
 * Structured registry of direct employers and staffing intermediaries
 * relevant to Sample Candidate TPM / IT PM / Program Manager job search.
 *
 * Single source of truth rules:
 * - Target employer data lives here only
 * - normaliseJob in jobFinder.js uses getEmployerMeta() to tag each job
 * - Do NOT re-implement employer logic in n8n or the frontend
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const EMPLOYER_PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const EMPLOYER_TYPE = {
  DIRECT: 'direct',
  INTERMEDIARY: 'intermediary',
};

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Target Employer Registry.
 *
 * Each entry represents a known employer (direct) or staffing intermediary.
 * Fields:
 *   id                - unique slug
 *   employer_name     - canonical display name
 *   careers_url       - careers/jobs page URL
 *   ats_type          - greenhouse | lever | workday | taleo | icims | smartrecruiters | unknown
 *   source_family     - greenhouse | lever | usajobs | rss | manual_external
 *   direct_employer   - true = direct hire employer
 *   intermediary      - true = staffing firm / recruiter platform
 *   priority          - high | medium | low
 *   lane_relevance    - array of lane ids (tpm, delivery_manager, ops_manager, program_manager)
 *   domain_tags       - array of domain tags
 *   federal_relevance - true if this employer regularly has federal/gov work
 *   cloud_relevance   - true if strong cloud/infrastructure roles
 *   security_relevance - true if IAM/security/SOAR roles
 *   remote_relevance  - true if commonly posts remote/hybrid roles
 *   geography         - primary geography
 *   notes             - operator notes
 *   active            - true = actively targeting; false = paused
 */
export const TARGET_EMPLOYER_REGISTRY = [
  // ─── Priority Direct Employers: Federal / Government / Consulting ─────────
  {
    id: 'ter-001',
    employer_name: 'Leidos',
    careers_url: 'https://www.leidos.com/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'delivery_manager', 'program_manager'],
    domain_tags: ['federal', 'defense', 'it-delivery', 'cloud', 'security'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (remote-friendly)',
    notes: 'Major federal IT contractor. Strong TPM/PM demand across DoD, VA, IRS. IAM delivery roles common.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-002',
    employer_name: 'SAIC',
    careers_url: 'https://jobs.saic.com',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'delivery_manager', 'program_manager'],
    domain_tags: ['federal', 'defense', 'it-delivery', 'cloud', 'security'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (remote-friendly)',
    notes: 'Federal IT services firm with strong PM/TPM demand. VA, DoD, IRS delivery contracts.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-003',
    employer_name: 'Booz Allen Hamilton',
    careers_url: 'https://careers.boozallen.com',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'program_manager', 'delivery_manager'],
    domain_tags: ['federal', 'consulting', 'it-delivery', 'cloud', 'security', 'iam'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (DC metro + remote)',
    notes: 'Top federal consulting firm. Strong IAM, cloud, and regulated delivery PM demand.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-004',
    employer_name: 'Deloitte',
    careers_url: 'https://www2.deloitte.com/us/en/careers.html',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'program_manager', 'delivery_manager'],
    domain_tags: ['consulting', 'federal', 'cloud', 'it-delivery', 'digital-transformation'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'Major consulting firm with strong federal practice. TPM/PM demand in cloud migration, digital transformation.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-005',
    employer_name: 'Accenture Federal Services',
    careers_url: 'https://www.accenturefederal.com/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'program_manager', 'delivery_manager'],
    domain_tags: ['federal', 'consulting', 'cloud', 'it-delivery', 'iam', 'security'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (DC metro + remote)',
    notes: 'Federal consulting arm with cloud-native and IAM delivery focus. Strong PM/TPM demand.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-006',
    employer_name: 'ManTech International',
    careers_url: 'https://www.mantech.com/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'ops_manager'],
    domain_tags: ['federal', 'defense', 'it-delivery', 'security'],
    federal_relevance: true,
    cloud_relevance: false,
    security_relevance: true,
    remote_relevance: false,
    geography: 'US (DC metro)',
    notes: 'Defense/federal IT contractor. Ops-heavy but strong technical PM demand.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  // ─── Priority Direct Employers: Commercial Tech / Cloud ───────────────────
  {
    id: 'ter-007',
    employer_name: 'Amazon Web Services (AWS)',
    careers_url: 'https://aws.amazon.com/careers/',
    ats_type: 'amazon',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'delivery_manager'],
    domain_tags: ['cloud', 'tech', 'it-delivery', 'enterprise'],
    federal_relevance: false,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'Strong TPM demand for cloud migrations and enterprise delivery. Bar Raiser process — prep well.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-008',
    employer_name: 'Microsoft',
    careers_url: 'https://careers.microsoft.com',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'program_manager'],
    domain_tags: ['cloud', 'tech', 'it-delivery', 'azure'],
    federal_relevance: false,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'PM roles at Microsoft skew Product but TPM/delivery roles exist in Azure and enterprise orgs.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-009',
    employer_name: 'IBM',
    careers_url: 'https://www.ibm.com/employment/',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'program_manager', 'delivery_manager'],
    domain_tags: ['cloud', 'consulting', 'it-delivery', 'federal', 'enterprise'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'IBM Consulting has strong TPM/PM demand across cloud migration and enterprise delivery.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-010',
    employer_name: 'Cognizant',
    careers_url: 'https://careers.cognizant.com',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'program_manager'],
    domain_tags: ['consulting', 'it-delivery', 'cloud', 'enterprise'],
    federal_relevance: false,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'Strong IT delivery PM demand in enterprise consulting practice.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-011',
    employer_name: 'Infosys',
    careers_url: 'https://www.infosys.com/careers/',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager'],
    domain_tags: ['consulting', 'it-delivery', 'cloud', 'enterprise'],
    federal_relevance: false,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'IT services consulting — strong delivery PM demand for cloud migrations.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  // ─── Intermediaries / Staffing Firms ─────────────────────────────────────
  {
    id: 'ter-012',
    employer_name: 'Robert Half Technology',
    careers_url: 'https://www.roberthalf.com/us/en/jobs/technology',
    ats_type: 'greenhouse',
    source_family: 'manual_external',
    direct_employer: false,
    intermediary: true,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'ops_manager'],
    domain_tags: ['staffing', 'it-delivery', 'contract', 'permanent'],
    federal_relevance: false,
    cloud_relevance: false,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide)',
    notes: 'Major IT staffing firm. Often posts on behalf of direct employers — identify the actual client.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-013',
    employer_name: 'Apex Systems',
    careers_url: 'https://www.apexsystems.com/careers',
    ats_type: 'unknown',
    source_family: 'manual_external',
    direct_employer: false,
    intermediary: true,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'ops_manager'],
    domain_tags: ['staffing', 'it-delivery', 'contract', 'federal'],
    federal_relevance: true,
    cloud_relevance: false,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide)',
    notes: 'IT staffing with federal practice. Often places TPM/PM contractors at federal agencies.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-014',
    employer_name: 'Insight Global',
    careers_url: 'https://insightglobal.com/jobs/',
    ats_type: 'unknown',
    source_family: 'manual_external',
    direct_employer: false,
    intermediary: true,
    priority: EMPLOYER_PRIORITY.LOW,
    lane_relevance: ['tpm', 'delivery_manager'],
    domain_tags: ['staffing', 'it-delivery', 'contract'],
    federal_relevance: false,
    cloud_relevance: false,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide)',
    notes: 'Large IT staffing firm. Check for direct employer identity behind listings.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-015',
    employer_name: 'Guidehouse',
    careers_url: 'https://guidehouse.com/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'program_manager', 'delivery_manager'],
    domain_tags: ['federal', 'consulting', 'it-delivery', 'cloud', 'security'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (DC metro + remote)',
    notes: 'Federal consulting firm with strong PM/TPM demand. Spun out from PwC Public Sector.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-016',
    employer_name: 'MITRE Corporation',
    careers_url: 'https://careers.mitre.org',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.HIGH,
    lane_relevance: ['tpm', 'program_manager'],
    domain_tags: ['federal', 'research', 'it-delivery', 'security', 'iam'],
    federal_relevance: true,
    cloud_relevance: false,
    security_relevance: true,
    remote_relevance: true,
    geography: 'US (DC metro + remote)',
    notes: 'Nonprofit R&D for federal agencies. Strong PM demand. Security clearance often required.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-017',
    employer_name: 'CGI Federal',
    careers_url: 'https://www.cgi.com/en/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'ops_manager'],
    domain_tags: ['federal', 'it-delivery', 'cloud', 'enterprise'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (nationwide + remote)',
    notes: 'IT services for federal agencies. Strong delivery PM/TPM demand.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-018',
    employer_name: 'General Dynamics IT (GDIT)',
    careers_url: 'https://www.gdit.com/careers/',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager', 'ops_manager', 'program_manager'],
    domain_tags: ['federal', 'defense', 'it-delivery', 'cloud', 'security'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: true,
    remote_relevance: false,
    geography: 'US (DC metro + nationwide)',
    notes: 'GDIT has strong PM/TPM demand across DoD and civilian federal agencies.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-019',
    employer_name: 'Unison',
    careers_url: 'https://www.unison.com/careers',
    ats_type: 'greenhouse',
    source_family: 'greenhouse',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'delivery_manager'],
    domain_tags: ['federal', 'it-delivery', 'cloud'],
    federal_relevance: true,
    cloud_relevance: true,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (remote-friendly)',
    notes: 'Federal IT delivery firm discoverable via Greenhouse boards.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'ter-020',
    employer_name: 'ICF',
    careers_url: 'https://www.icf.com/careers',
    ats_type: 'workday',
    source_family: 'manual_external',
    direct_employer: true,
    intermediary: false,
    priority: EMPLOYER_PRIORITY.MEDIUM,
    lane_relevance: ['tpm', 'program_manager'],
    domain_tags: ['federal', 'consulting', 'it-delivery', 'digital-transformation'],
    federal_relevance: true,
    cloud_relevance: false,
    security_relevance: false,
    remote_relevance: true,
    geography: 'US (DC metro + remote)',
    notes: 'Federal consulting and digital transformation. PM/TPM demand in IT modernisation.',
    active: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

// ─── Warning labels for source quality signals ────────────────────────────────

export const SOURCE_WARNING_LABELS = {
  intermediary_only: 'Posted by staffing intermediary — identify direct employer before applying',
  unknown_employer: 'Employer not in target registry — validate fit before applying',
  low_priority: 'Low-priority employer — deprioritise unless exceptional role',
};

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Return the registry entry for a given employer name (case-insensitive partial match).
 * Returns null if not found.
 */
export function getEmployerMeta(employerName) {
  if (!employerName) return null;
  const name = employerName.toLowerCase().trim();
  return TARGET_EMPLOYER_REGISTRY.find(e =>
    e.employer_name.toLowerCase().includes(name) ||
    name.includes(e.employer_name.toLowerCase())
  ) || null;
}

/**
 * Return true if the employer is in the target registry and active.
 */
export function isTargetEmployer(employerName) {
  const meta = getEmployerMeta(employerName);
  return !!(meta && meta.active);
}

/**
 * Return 'direct' | 'intermediary' | 'unknown' for a given employer name.
 */
export function classifyEmployerType(employerName) {
  const meta = getEmployerMeta(employerName);
  if (!meta) return EMPLOYER_TYPE.DIRECT; // unknown — treat as direct for display
  if (meta.intermediary) return EMPLOYER_TYPE.INTERMEDIARY;
  return EMPLOYER_TYPE.DIRECT;
}

/**
 * Return true if the employer is a known staffing intermediary.
 */
export function isIntermediaryEmployer(employerName) {
  const meta = getEmployerMeta(employerName);
  return !!(meta && meta.intermediary);
}

/**
 * Return all active direct target employers, sorted by priority.
 */
export function getActiveDirectTargetEmployers() {
  const order = { [EMPLOYER_PRIORITY.HIGH]: 0, [EMPLOYER_PRIORITY.MEDIUM]: 1, [EMPLOYER_PRIORITY.LOW]: 2 };
  return TARGET_EMPLOYER_REGISTRY
    .filter(e => e.active && e.direct_employer)
    .sort((a, b) => (order[a.priority] || 2) - (order[b.priority] || 2));
}

/**
 * Return all known staffing intermediaries.
 */
export function getKnownIntermediaries() {
  return TARGET_EMPLOYER_REGISTRY.filter(e => e.intermediary);
}

// ─── Quality signals ──────────────────────────────────────────────────────────

/**
 * Compute employer quality signals for an opportunity.
 * Returns an object with is_target_employer, employer_type, employer_priority,
 * is_intermediary, federal_relevance, cloud_relevance, security_relevance flags.
 */
export function computeEmployerQualitySignals(opp) {
  const company = opp.company || '';
  const meta = getEmployerMeta(company);

  return {
    is_target_employer: !!(meta && meta.active),
    employer_type: meta ? (meta.intermediary ? EMPLOYER_TYPE.INTERMEDIARY : EMPLOYER_TYPE.DIRECT) : EMPLOYER_TYPE.DIRECT,
    employer_priority: meta ? meta.priority : null,
    is_intermediary: !!(meta && meta.intermediary),
    federal_relevance: !!(meta && meta.federal_relevance),
    cloud_relevance: !!(meta && meta.cloud_relevance),
    security_relevance: !!(meta && meta.security_relevance),
    employer_meta: meta || null,
  };
}

/**
 * Return any source quality warnings for an opportunity.
 * Returns an array of warning strings.
 */
export function getSourceQualityWarnings(opp) {
  const warnings = [];
  const meta = getEmployerMeta(opp.company || '');

  if (meta && meta.intermediary) {
    warnings.push(SOURCE_WARNING_LABELS.intermediary_only);
  } else if (!meta) {
    // Only warn if it came from a live source (not manual)
    if (opp.source_family !== 'manual_external') {
      warnings.push(SOURCE_WARNING_LABELS.unknown_employer);
    }
  } else if (meta.priority === EMPLOYER_PRIORITY.LOW) {
    warnings.push(SOURCE_WARNING_LABELS.low_priority);
  }

  return warnings;
}

/**
 * Build approval queue signals for a list of opportunities.
 * Returns summary stats useful for the operator UI.
 */
export function buildApprovalQueueSignals(opps) {
  const pending = opps.filter(o => o.approval_state === 'pending');
  const targetCount = pending.filter(o => isTargetEmployer(o.company || '')).length;
  const intermediaryCount = pending.filter(o => isIntermediaryEmployer(o.company || '')).length;
  const directCount = pending.filter(o =>
    isTargetEmployer(o.company || '') && !isIntermediaryEmployer(o.company || '')
  ).length;
  const federalCount = pending.filter(o => {
    const meta = getEmployerMeta(o.company || '');
    return meta && meta.federal_relevance;
  }).length;

  return {
    total_pending: pending.length,
    target_employer_count: targetCount,
    direct_employer_count: directCount,
    intermediary_count: intermediaryCount,
    federal_count: federalCount,
    unknown_employer_count: pending.length - targetCount,
  };
}
