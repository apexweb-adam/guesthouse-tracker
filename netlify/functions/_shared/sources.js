/**
 * Source Governance
 *
 * Source definitions, trust levels, enable/disable controls,
 * and the live-intake kill switch.
 *
 * This is the authoritative source allowlist.
 * Live intake (non-CSV/manual) is OFF by default — must be explicitly enabled.
 */

export const SOURCE_TYPES = {
  MANUAL: 'manual',
  CSV: 'csv',
  RSS: 'rss',
  API: 'api',
  EMAIL: 'email',
  DEMO: 'demo',
};

export const TRUST_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * Live intake kill switch.
 * When false, all automated source ingestion is blocked regardless of per-source settings.
 * Manual and CSV intake are always allowed.
 *
 * In deployed mode: controlled by LIVE_INTAKE_ENABLED env var.
 * Default: false (safe by default).
 */
export function isLiveIntakeEnabled() {
  // Works in both Node.js (functions) and browser (import.meta.env fallback)
  if (typeof process !== 'undefined' && process.env) {
    return process.env.LIVE_INTAKE_ENABLED === 'true';
  }
  // Browser-side: always false (live intake only via functions)
  return false;
}

/**
 * Default source registry.
 * These are starting defaults. Actual enabled/disabled state is stored in DB.
 */
export const DEFAULT_SOURCES = [
  {
    id: 'src-manual',
    name: 'Manual Intake',
    type: SOURCE_TYPES.MANUAL,
    url: null,
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Roles entered manually by the candidate.',
    liveCapable: false,
  },
  {
    id: 'src-manual-external',
    name: 'Quick Add (External Posting)',
    type: SOURCE_TYPES.MANUAL,
    url: null,
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Roles pasted manually from LinkedIn or any external posting. Not scraped — user provides the JD text.',
    liveCapable: false,
  },
  {
    id: 'src-csv',
    name: 'CSV Upload / Paste',
    type: SOURCE_TYPES.CSV,
    url: null,
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Bulk import via CSV file upload or pasted CSV text.',
    liveCapable: false,
  },
  {
    id: 'src-demo',
    name: 'Demo Data',
    type: SOURCE_TYPES.DEMO,
    url: null,
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Pre-loaded demonstration data — safe for preview/testing.',
    liveCapable: false,
  },
  // ── RSS / Atom Feeds ────────────────────────────────────────────────────────
  {
    id: 'src-rss-jobicy',
    name: 'Jobicy RSS (Remote Management)',
    type: SOURCE_TYPES.RSS,
    sourceFamily: 'jobicy',
    url: 'https://jobicy.com/?feed=job_feed&job_categories=management&job_types=remote',
    enabled: true,
    trustLevel: TRUST_LEVELS.MEDIUM,
    description: 'Jobicy RSS feed for remote management/TPM roles. Requires LIVE_INTAKE_ENABLED=true.',
    liveCapable: true,
  },
  // ── ATS Public APIs ─────────────────────────────────────────────────────────
  {
    id: 'src-greenhouse-boards',
    name: 'Greenhouse Job Boards (configured companies)',
    type: SOURCE_TYPES.API,
    sourceFamily: 'greenhouse',
    url: null, // configured via GREENHOUSE_BOARDS env var (comma-separated board tokens)
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Greenhouse public job board API. Set GREENHOUSE_BOARDS env var to comma-separated board tokens (e.g. telstra,anz). No auth required — these are public boards.',
    liveCapable: true,
  },
  {
    id: 'src-lever-boards',
    name: 'Lever Job Postings (configured companies)',
    type: SOURCE_TYPES.API,
    sourceFamily: 'lever',
    url: null, // configured via LEVER_BOARDS env var (comma-separated site slugs)
    enabled: true,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'Lever public postings API. Set LEVER_BOARDS env var to comma-separated company slugs. Public read-only — no auth required.',
    liveCapable: true,
  },
  {
    id: 'src-usajobs',
    name: 'USAJobs (Federal Government)',
    type: SOURCE_TYPES.API,
    sourceFamily: 'usajobs',
    url: null, // https://data.usajobs.gov/api/search — requires USAJOBS_API_KEY and USAJOBS_USER_AGENT
    enabled: false,
    trustLevel: TRUST_LEVELS.HIGH,
    description: 'USAJobs REST API for federal PM/TPM roles. Set USAJOBS_API_KEY and USAJOBS_USER_AGENT. Must be used within API terms of service.',
    liveCapable: true,
  },
  // ── Not automated ────────────────────────────────────────────────────────────
  {
    id: 'src-rss-linkedin-jobs',
    name: 'LinkedIn Job Alerts (NOT automated)',
    type: SOURCE_TYPES.EMAIL,
    sourceFamily: 'linkedin',
    url: null,
    enabled: false,
    trustLevel: TRUST_LEVELS.MEDIUM,
    description: 'LinkedIn job alert emails parsed as structured input — NOT browser automation, NOT scraping. Requires email forwarding setup.',
    liveCapable: true,
  },
];

// ─── Source Families ──────────────────────────────────────────────────────────

export const SOURCE_FAMILIES = {
  JOBICY: 'jobicy',
  GREENHOUSE: 'greenhouse',
  LEVER: 'lever',
  USAJOBS: 'usajobs',
  RSS: 'rss',
  MANUAL: 'manual',
  MANUAL_EXTERNAL: 'manual_external', // user-pasted external role (e.g. from LinkedIn, company site)
  CSV: 'csv',
  DEMO: 'demo',
  LINKEDIN: 'linkedin', // NOT automated — email intake only
};

// ─── Discovery Profile (Sample Candidate) ────────────────────────────────────

/**
 * Discovery profile — governs what the job finder fetches and filters.
 * This filters at intake, before scoring. Scoring further refines the shortlist.
 *
 * The profile defaults can be overridden via env vars or DB config.
 * The title/domain lists are intentionally targeted, not broad.
 */
export const DEFAULT_DISCOVERY_PROFILE = {
  name: 'Sample Candidate — TPM Primary',

  // Title keywords to include (case-insensitive, any match = include)
  includeTitleKeywords: [
    'technical project manager',
    'technical program manager',
    'senior project manager',
    'IT project manager',
    'delivery manager',
    'technical delivery manager',
    'programme manager',
    'program manager', // selective — only if governance signals present
  ],

  // Title keywords to exclude outright (before scoring)
  excludeTitleKeywords: [
    'junior',
    'graduate',
    'assistant',
    'coordinator',
    'entry level',
    'intern',
    'analyst', // general analyst roles — too broad
    'marketing',
    'sales',
    'HR',
    'finance manager',
    'facilities',
    'event',
    'change manager', // different discipline
  ],

  // Domain keywords to include in description (any match = keep)
  includeDomainKeywords: [
    'agile',
    'scrum',
    'SDLC',
    'technical delivery',
    'cloud',
    'platform',
    'software delivery',
    'digital transformation',
    'infrastructure',
    'stakeholder',
    'readiness',
    'technology',
  ],

  // Description keywords that signal a role is out of scope
  excludeDomainKeywords: [
    'construction',
    'civil engineering',
    'mining',
    'manufacturing',
    'retail operations',
    'supply chain only',
    'FMCG',
  ],

  // Location preferences (any of these = match)
  locationPreferences: ['Sydney', 'Melbourne', 'Brisbane', 'Remote', 'Hybrid', 'WFH', 'Australia'],

  // Remote/hybrid preference
  remoteOrHybrid: true,

  // Salary floor (AUD) — used to filter if salary data is available
  salaryFloorAUD: 120000,

  // Maximum records per discovery run (before dedup/scoring).
  // Raised 2026-06-01 from 50 → 250 because 25 active greenhouse boards
  // + 4 lever boards would otherwise saturate at Stripe alone.
  maxRecordsPerRun: 250,

  // Source families to enable for this profile
  enabledSourceFamilies: ['jobicy', 'greenhouse', 'lever', 'usajobs', 'rss'],
};

/**
 * Filter a job by the discovery profile.
 * Returns true if the job passes the filter (should be processed).
 * Returns false if the job should be discarded before scoring.
 */
export function passesDiscoveryProfile(job, profile = DEFAULT_DISCOVERY_PROFILE) {
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const locationLower = (job.location || '').toLowerCase();

  // Must match at least one include-title keyword
  const titleMatch = profile.includeTitleKeywords.some(kw => titleLower.includes(kw.toLowerCase()));
  if (!titleMatch) return false;

  // Must not match any exclude-title keyword
  const titleExclude = profile.excludeTitleKeywords.some(kw => titleLower.includes(kw.toLowerCase()));
  if (titleExclude) return false;

  // If exclude-domain keywords present in description, reject
  const domainExclude = profile.excludeDomainKeywords.some(kw => descLower.includes(kw.toLowerCase()));
  if (domainExclude) return false;

  return true;
}

/**
 * Check whether a source is allowed to run live intake.
 * Respects the global kill switch and per-source enabled flag.
 */
export function canSourceRunLive(source) {
  if (!isLiveIntakeEnabled()) return false;
  if (!source.enabled) return false;
  if (!source.liveCapable) return false;
  return true;
}

/**
 * Given a list of sources from DB, merge with defaults for any missing sources.
 */
export function mergeWithDefaults(dbSources = []) {
  const merged = [...DEFAULT_SOURCES];
  for (const dbSource of dbSources) {
    const idx = merged.findIndex(s => s.id === dbSource.id);
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...dbSource };
    } else {
      merged.push(dbSource);
    }
  }
  return merged;
}
