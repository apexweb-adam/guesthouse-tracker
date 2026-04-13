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
  {
    id: 'src-rss-seek',
    name: 'SEEK RSS (Technical PM)',
    type: SOURCE_TYPES.RSS,
    url: 'https://www.seek.com.au/jobs-in-information-communication-technology/full-time.rss',
    enabled: false, // OFF by default — enable after deployment verification
    trustLevel: TRUST_LEVELS.MEDIUM,
    description: 'SEEK structured RSS feed for Technical PM roles. Requires LIVE_INTAKE_ENABLED=true.',
    liveCapable: true,
  },
  {
    id: 'src-rss-linkedin-jobs',
    name: 'LinkedIn Job Alerts (NOT automated)',
    type: SOURCE_TYPES.EMAIL,
    url: null,
    enabled: false,
    trustLevel: TRUST_LEVELS.MEDIUM,
    description: 'LinkedIn job alert emails parsed as structured input — NOT browser automation. Requires email forwarding setup.',
    liveCapable: true,
  },
];

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
