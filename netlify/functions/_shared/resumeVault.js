/**
 * Resume Vault — _shared/resumeVault.js
 *
 * Structured resume management for Sample Candidate.
 *
 * Provides:
 *   - INITIAL_VAULT: the 9 registered resumes with status, lane, domain tags
 *   - Active / Fallback / Archived logic
 *   - Vault-based resume recommendation engine
 *   - Quality gate checks before apply
 *   - Application logging helper
 *   - Vault analytics
 *
 * Rules:
 *   - Archived resumes are NEVER default-selected
 *   - Active canonical resumes are preferred in recommendations
 *   - Fallback resumes require a clear role-lane justification
 *   - No auto-submit, no fabrication
 *
 * This module is pure business logic — no side effects, no HTTP calls.
 * Import it from Netlify Functions and from the frontend (browser-safe).
 */

import { LANES } from './scoring.js';

// ─── Vault status constants ────────────────────────────────────────────────────

export const VAULT_STATUS = {
  ACTIVE: 'active',
  FALLBACK: 'fallback',
  ARCHIVED: 'archived',
};

// ─── Vault lane constants ─────────────────────────────────────────────────────
// These are the resume-specific lane labels (more granular than scoring.js LANES).

export const VAULT_LANES = {
  TPM: 'tpm',
  IT_PM: 'it_pm',
  DELIVERY: 'delivery',
  PROGRAM: 'program',
  OPS: 'ops',
  PM_GENERIC: 'pm_generic',
};

export const VAULT_LANE_LABELS = {
  [VAULT_LANES.TPM]: 'Technical Project Manager',
  [VAULT_LANES.IT_PM]: 'IT / Delivery Project Manager',
  [VAULT_LANES.DELIVERY]: 'Agile / Delivery Manager',
  [VAULT_LANES.PROGRAM]: 'Program Manager (Selective)',
  [VAULT_LANES.OPS]: 'Operations Manager (Conditional)',
  [VAULT_LANES.PM_GENERIC]: 'Generic PM (Low fit)',
};

export const VAULT_STATUS_LABELS = {
  [VAULT_STATUS.ACTIVE]: 'Active',
  [VAULT_STATUS.FALLBACK]: 'Fallback',
  [VAULT_STATUS.ARCHIVED]: 'Archived',
};

// ─── Vault lane → scoring.js LANES mapping ────────────────────────────────────

export const VAULT_LANE_TO_SCORING_LANE = {
  [VAULT_LANES.TPM]: LANES.TPM,
  [VAULT_LANES.IT_PM]: LANES.TPM,            // IT PM → TPM lane for scoring purposes
  [VAULT_LANES.DELIVERY]: LANES.DELIVERY_MANAGER,
  [VAULT_LANES.PROGRAM]: LANES.PROGRAM_MANAGER,
  [VAULT_LANES.OPS]: LANES.OPS_MANAGER,
  [VAULT_LANES.PM_GENERIC]: LANES.GENERIC_PM,
};

// ─── Initial Resume Vault (9 resumes) ─────────────────────────────────────────

const VAULT_SEED_DATE = '2026-04-22T00:00:00.000Z';

/**
 * The 9 registered resumes for Sample Candidate.
 *
 * Status decisions:
 *   - 3 active canonical: TPM, IT PM, Agile/Delivery — the daily working set
 *   - 4 fallback: Senior PM, Delivery Manager, Program Manager, Ops Manager
 *       (require role-specific justification before use)
 *   - 2 archived: Generic PM v1 + v2 — superseded, do not use
 *
 * Domain tags drive overlap scoring in the recommendation engine.
 */
export const INITIAL_VAULT = [
  // ── 1. Technical Project Manager — PRIMARY, ACTIVE CANONICAL ──────────────
  {
    id: 'rv-tpm-01',
    display_name: 'Technical Project Manager — Primary',
    original_file_name: 'sample_candidate_Technical_Project_Manager.pdf',
    lane: VAULT_LANES.TPM,
    status: VAULT_STATUS.ACTIVE,
    domain_tags: ['sdlc', 'agile', 'stakeholder', 'digital-transformation', 'cloud', 'platform-delivery'],
    quality_score: 95,
    notes: 'Primary resume. Use for all TPM, Technical PM, and technology delivery roles. Highest signal. Do not substitute without a clear reason.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v2.1',
    duplicate_group: 'tpm',
    is_canonical: true,
  },

  // ── 2. IT Project Manager — ACTIVE CANONICAL ──────────────────────────────
  {
    id: 'rv-it-pm-01',
    display_name: 'IT Project Manager — Primary',
    original_file_name: 'sample_candidate_IT_Project_Manager.pdf',
    lane: VAULT_LANES.IT_PM,
    status: VAULT_STATUS.ACTIVE,
    domain_tags: ['it-delivery', 'sdlc', 'iam', 'infrastructure', 'security', 'digital', 'splunk', 'cloud'],
    quality_score: 90,
    notes: 'Primary for IT PM, digital delivery, IT infrastructure delivery. Strong for federal/gov and IAM-heavy roles.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v2.0',
    duplicate_group: 'it-pm',
    is_canonical: true,
  },

  // ── 3. Senior Project Manager — FALLBACK (TPM lane variant) ───────────────
  {
    id: 'rv-tpm-senior-01',
    display_name: 'Senior Project Manager — Fallback',
    original_file_name: 'sample_candidate_Senior_Project_Manager.pdf',
    lane: VAULT_LANES.TPM,
    status: VAULT_STATUS.FALLBACK,
    domain_tags: ['senior', 'sdlc', 'stakeholder', 'governance', 'cross-functional'],
    quality_score: 82,
    notes: 'Fallback for senior general PM roles where "Technical" is not in the title but seniority is emphasised. Prefer rv-tpm-01 for explicit TPM roles.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.8',
    duplicate_group: 'tpm',
    is_canonical: false,
  },

  // ── 4. Agile Project Manager — ACTIVE CANONICAL (Delivery lane) ───────────
  {
    id: 'rv-delivery-agile-01',
    display_name: 'Agile / Delivery Manager — Primary',
    original_file_name: 'sample_candidate_Agile_Project_Manager.pdf',
    lane: VAULT_LANES.DELIVERY,
    status: VAULT_STATUS.ACTIVE,
    domain_tags: ['agile', 'scrum', 'safe', 'sprint', 'velocity', 'delivery-cadence', 'release-management'],
    quality_score: 89,
    notes: 'Primary for Agile PM and Delivery Manager roles. Emphasises sprint ownership, agile delivery ceremonies, and team velocity.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v2.0',
    duplicate_group: 'delivery',
    is_canonical: true,
  },

  // ── 5. Delivery Manager — FALLBACK (Delivery lane) ────────────────────────
  {
    id: 'rv-delivery-dm-01',
    display_name: 'Delivery Manager — Fallback',
    original_file_name: 'sample_candidate_Delivery_Manager.pdf',
    lane: VAULT_LANES.DELIVERY,
    status: VAULT_STATUS.FALLBACK,
    domain_tags: ['delivery', 'release-management', 'agile', 'team-outcomes', 'stakeholder'],
    quality_score: 80,
    notes: 'Fallback for Delivery Manager roles when agile ceremony emphasis is less critical. Prefer rv-delivery-agile-01 for Agile/SAFe-heavy roles.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.5',
    duplicate_group: 'delivery',
    is_canonical: false,
  },

  // ── 6. Program Manager — FALLBACK SELECTIVE ───────────────────────────────
  {
    id: 'rv-program-01',
    display_name: 'Program Manager — Selective',
    original_file_name: 'sample_candidate_Program_Manager.pdf',
    lane: VAULT_LANES.PROGRAM,
    status: VAULT_STATUS.FALLBACK,
    domain_tags: ['pmo', 'governance', 'portfolio', 'enterprise', 'transformation', 'programme-board'],
    quality_score: 78,
    notes: 'Use ONLY for governance-heavy Program Manager roles with explicit PMO/portfolio scope. Not for generic PM. Requires role-lane justification.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.6',
    duplicate_group: 'program',
    is_canonical: true,
  },

  // ── 7. Operations Manager — FALLBACK CONDITIONAL ──────────────────────────
  {
    id: 'rv-ops-01',
    display_name: 'Operations Manager — Conditional',
    original_file_name: 'sample_candidate_Operations_Manager.pdf',
    lane: VAULT_LANES.OPS,
    status: VAULT_STATUS.FALLBACK,
    domain_tags: ['itsm', 'itil', 'readiness', 'compliance', 'technical-operations', 'service-management', 'incident-management'],
    quality_score: 74,
    notes: 'Use ONLY for technical operations roles with ITSM/readiness/compliance scope. Not for generic ops management. Requires technical qualifier.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.4',
    duplicate_group: 'ops',
    is_canonical: true,
  },

  // ── 8. Generic PM v1 — ARCHIVED ───────────────────────────────────────────
  {
    id: 'rv-generic-pm-v1',
    display_name: 'Generic Project Manager v1 — Archived',
    original_file_name: 'sample_candidate_Project_Manager_v1.pdf',
    lane: VAULT_LANES.PM_GENERIC,
    status: VAULT_STATUS.ARCHIVED,
    domain_tags: ['generic-pm'],
    quality_score: 55,
    notes: 'Archived. Replaced by lane-specific versions. Do not use for new applications. Retained for audit trail only.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.0',
    duplicate_group: 'generic',
    is_canonical: false,
  },

  // ── 9. Generic PM v2 — ARCHIVED ───────────────────────────────────────────
  {
    id: 'rv-generic-pm-v2',
    display_name: 'Generic Project Manager v2 — Archived',
    original_file_name: 'sample_candidate_Project_Manager_v2.pdf',
    lane: VAULT_LANES.PM_GENERIC,
    status: VAULT_STATUS.ARCHIVED,
    domain_tags: ['generic-pm'],
    quality_score: 58,
    notes: 'Archived. Second generic version. Do not use for new applications. Retained for audit trail only.',
    uploaded_at: VAULT_SEED_DATE,
    updated_at: VAULT_SEED_DATE,
    version_label: 'v1.1',
    duplicate_group: 'generic',
    is_canonical: false,
  },
];

// ─── Vault filter helpers ──────────────────────────────────────────────────────

export function getActiveResumes(vault) {
  return (vault || INITIAL_VAULT).filter(r => r.status === VAULT_STATUS.ACTIVE);
}

export function getFallbackResumes(vault) {
  return (vault || INITIAL_VAULT).filter(r => r.status === VAULT_STATUS.FALLBACK);
}

export function getArchivedResumes(vault) {
  return (vault || INITIAL_VAULT).filter(r => r.status === VAULT_STATUS.ARCHIVED);
}

/**
 * Returns resumes that can be selected for an application.
 * Archived resumes are EXCLUDED — they must never be default-selectable.
 */
export function getSelectableResumes(vault) {
  return (vault || INITIAL_VAULT).filter(r => r.status !== VAULT_STATUS.ARCHIVED);
}

export function getCanonicalResumes(vault) {
  return (vault || INITIAL_VAULT).filter(r => r.is_canonical && r.status === VAULT_STATUS.ACTIVE);
}

export function getResumeById(id, vault) {
  return (vault || INITIAL_VAULT).find(r => r.id === id) || null;
}

// ─── Recommendation Engine ─────────────────────────────────────────────────────

/**
 * Recommend the best vault resume for an opportunity.
 *
 * Uses scoring lane, fit score, signals, and domain overlap.
 * Preference order: active canonical > active non-canonical > fallback.
 * Never recommends archived resumes.
 *
 * @param {string} lane - scoring.js LANES value (e.g. LANES.TPM)
 * @param {number} fitScore - opportunity fit score (0–100)
 * @param {string[]} signals - fit_signals from scoring
 * @param {Array} vault - the resume vault (defaults to INITIAL_VAULT)
 * @returns {{ resume, confidence, reason, lane_match, domain_overlap }}
 */
export function recommendVaultResume(lane, fitScore = 0, signals = [], vault = INITIAL_VAULT) {
  const selectable = getSelectableResumes(vault);
  if (selectable.length === 0) {
    return {
      resume: null,
      confidence: 'low',
      reason: 'No active or fallback resumes in vault. Add at least one active resume.',
      lane_match: false,
      domain_overlap: [],
    };
  }

  // Normalise signals to lowercase text for domain overlap matching
  const signalText = signals.map(s => s.toLowerCase()).join(' ');

  // Lane preference lists: scoring lane → preferred vault lane order
  const LANE_PREFERENCE = {
    [LANES.TPM]: [VAULT_LANES.TPM, VAULT_LANES.IT_PM, VAULT_LANES.DELIVERY, VAULT_LANES.PM_GENERIC],
    [LANES.DELIVERY_MANAGER]: [VAULT_LANES.DELIVERY, VAULT_LANES.IT_PM, VAULT_LANES.TPM, VAULT_LANES.PM_GENERIC],
    [LANES.OPS_MANAGER]: [VAULT_LANES.OPS, VAULT_LANES.IT_PM, VAULT_LANES.TPM],
    [LANES.PROGRAM_MANAGER]: [VAULT_LANES.PROGRAM, VAULT_LANES.TPM, VAULT_LANES.IT_PM],
    [LANES.GENERIC_PM]: [VAULT_LANES.TPM, VAULT_LANES.IT_PM, VAULT_LANES.DELIVERY],
    [LANES.OTHER]: [VAULT_LANES.TPM, VAULT_LANES.IT_PM],
  };

  const preferred = LANE_PREFERENCE[lane] || [VAULT_LANES.TPM];

  function scoreCandidate(r) {
    let s = 0;
    // Status tier
    if (r.status === VAULT_STATUS.ACTIVE) s += 30;
    else if (r.status === VAULT_STATUS.FALLBACK) s += 10;
    // Canonical bonus
    if (r.is_canonical) s += 20;
    // Lane preference
    const pref = preferred.indexOf(r.lane);
    if (pref === 0) s += 25;
    else if (pref === 1) s += 15;
    else if (pref === 2) s += 8;
    else if (pref === 3) s += 3;
    // Quality score contribution
    s += (r.quality_score || 50) * 0.2;
    // Domain overlap
    const tags = (r.domain_tags || []).map(t => t.toLowerCase().replace(/-/g, ' '));
    const normalSignal = signalText.replace(/-/g, ' ');
    const overlap = tags.filter(t => normalSignal.includes(t));
    s += overlap.length * 5;
    return s;
  }

  const scored = selectable
    .map(r => ({ r, s: scoreCandidate(r) }))
    .sort((a, b) => b.s - a.s);

  const best = scored[0].r;
  const domainOverlap = (best.domain_tags || []).filter(t => {
    const norm = t.toLowerCase().replace(/-/g, ' ');
    return signalText.replace(/-/g, ' ').includes(norm);
  });

  // Confidence determination
  const lanePref = preferred.indexOf(best.lane);
  let confidence = 'low';
  if (best.status === VAULT_STATUS.ACTIVE && best.is_canonical && lanePref === 0 && fitScore >= 70) {
    confidence = 'high';
  } else if (best.status === VAULT_STATUS.ACTIVE && lanePref <= 1 && fitScore >= 50) {
    confidence = 'medium';
  }

  // Reason
  let reason = '';
  const laneLabel = VAULT_LANE_LABELS[best.lane] || best.lane;
  if (confidence === 'high') {
    reason = `${best.display_name} is the active canonical resume for this lane (${laneLabel}). Strong fit (score ${fitScore}). Recommended without override.`;
  } else if (confidence === 'medium') {
    reason = `${best.display_name} is the best available match for this role. Lane: ${laneLabel} (fit score ${fitScore}). Verify alignment with role description before submitting.`;
  } else {
    reason = `${best.display_name} is selected as closest available option. Lane match is partial (resume: ${laneLabel}, role: ${lane}, score ${fitScore}). Review carefully before applying.`;
  }

  if (best.status === VAULT_STATUS.FALLBACK) {
    reason += ` Note: This is a fallback resume — confirm the role lane specifically requires this emphasis.`;
  }

  return {
    resume: best,
    confidence,
    reason,
    lane_match: lanePref === 0,
    domain_overlap: domainOverlap,
  };
}

// ─── Quality Gates ─────────────────────────────────────────────────────────────

/**
 * Check quality gates before marking an opportunity ready-to-apply.
 *
 * @param {object} opp - opportunity record
 * @param {string|null} selectedResumeId - vault resume ID selected for this application
 * @param {Array} vault - the resume vault
 * @returns {{ passed: boolean, warnings: string[], blockers: string[] }}
 *
 * passed = true means no blockers (warnings may still exist).
 * Blockers must be resolved before applying.
 * Warnings are advisory — human review required.
 */
export function getVaultQualityGates(opp, selectedResumeId = null, vault = INITIAL_VAULT) {
  const warnings = [];
  const blockers = [];
  const v = vault || INITIAL_VAULT;

  // Gate 1: No resume selected
  if (!selectedResumeId) {
    warnings.push('No resume selected. Choose a resume before applying.');
  }

  if (selectedResumeId) {
    const resume = v.find(r => r.id === selectedResumeId);

    if (!resume) {
      warnings.push(`Resume ID "${selectedResumeId}" not found in vault. Re-select a resume.`);
    } else {
      // Gate 2: Archived resume — BLOCKER
      if (resume.status === VAULT_STATUS.ARCHIVED) {
        blockers.push(
          `"${resume.display_name}" is archived and must not be used for new applications. ` +
          `Select an active or fallback resume.`
        );
      }

      // Gate 3: Lane mismatch warning
      if (resume.status !== VAULT_STATUS.ARCHIVED && opp.lane) {
        const mappedScoringLane = VAULT_LANE_TO_SCORING_LANE[resume.lane];
        const isCloseMatch =
          (resume.lane === VAULT_LANES.IT_PM && opp.lane === LANES.TPM) ||
          (resume.lane === VAULT_LANES.TPM && opp.lane === LANES.DELIVERY_MANAGER) ||
          (resume.lane === VAULT_LANES.DELIVERY && opp.lane === LANES.TPM);

        if (mappedScoringLane && mappedScoringLane !== opp.lane && !isCloseMatch) {
          warnings.push(
            `Lane mismatch: resume lane is "${VAULT_LANE_LABELS[resume.lane]}" but role is classified as "${opp.lane}". ` +
            `Confirm this is intentional before submitting.`
          );
        }
      }

      // Gate 4: Ops resume for TPM role — BLOCKER
      if (opp.lane === LANES.TPM && resume.lane === VAULT_LANES.OPS) {
        blockers.push(
          `Operations resume selected for a TPM-classified role. This is a significant lane mismatch. ` +
          `Use the Technical PM or IT PM resume instead.`
        );
      }

      // Gate 5: Generic PM resume for strong-signal role — warning
      if (resume.lane === VAULT_LANES.PM_GENERIC && [LANES.TPM, LANES.DELIVERY_MANAGER].includes(opp.lane)) {
        warnings.push(
          `Generic PM resume selected for a ${opp.lane} role. ` +
          `A lane-specific resume will perform better. Upgrade to TPM or Delivery resume.`
        );
      }

      // Gate 6: Fallback resume advisory
      if (resume.status === VAULT_STATUS.FALLBACK) {
        warnings.push(
          `"${resume.display_name}" is a fallback resume. ` +
          `Ensure the role specifically requires ${VAULT_LANE_LABELS[resume.lane]} emphasis.`
        );
      }
    }
  }

  // Gate 7: Low fit score advisory
  if (typeof opp.fit_score === 'number' && opp.fit_score < 40) {
    warnings.push(
      `Low fit score (${opp.fit_score}). Consider whether this role is worth applying to given current priorities.`
    );
  }

  const passed = blockers.length === 0;
  return { passed, warnings, blockers };
}

// ─── Application Logging ───────────────────────────────────────────────────────

/**
 * Create an application log entry for tracking which resume was used.
 * Stored on the opportunity record under `applied_resume_log`.
 *
 * @param {string} resumeId - vault resume ID used
 * @param {Array} vault - the resume vault
 * @param {boolean} overridden - was the system recommendation overridden?
 * @param {string} overrideReason - why it was overridden
 * @returns {object|null} log entry
 */
export function createApplicationLog(resumeId, vault = INITIAL_VAULT, overridden = false, overrideReason = '') {
  const resume = (vault || INITIAL_VAULT).find(r => r.id === resumeId);
  if (!resume) return null;
  return {
    resume_id: resumeId,
    resume_display_name: resume.display_name,
    resume_lane: resume.lane,
    resume_version_label: resume.version_label,
    resume_status_at_use: resume.status,
    was_system_recommendation: !overridden,
    override_reason: overridden ? (overrideReason || '') : null,
    logged_at: new Date().toISOString(),
  };
}

// ─── Vault Analytics ───────────────────────────────────────────────────────────

/**
 * Compute per-resume analytics from a list of opportunity records.
 * Answers: which resume was used most, response/interview rates by version.
 *
 * @param {Array} opportunities - opportunity records
 * @param {Array} vault - the resume vault
 * @returns {Array} per-resume stats
 */
export function computeVaultAnalytics(opportunities = [], vault = INITIAL_VAULT) {
  const stats = {};
  for (const r of vault || INITIAL_VAULT) {
    stats[r.id] = {
      resume_id: r.id,
      display_name: r.display_name,
      lane: r.lane,
      lane_label: VAULT_LANE_LABELS[r.lane] || r.lane,
      status: r.status,
      is_canonical: r.is_canonical,
      quality_score: r.quality_score,
      applications_count: 0,
      responses_count: 0,
      interviews_count: 0,
      rejections_count: 0,
      response_rate: null,
      interview_rate: null,
    };
  }

  for (const opp of (opportunities || [])) {
    // Support both applied_resume_id (direct) and embedded in apply_pack
    const rid = opp.applied_resume_id || opp.apply_pack?.resume_id_used;
    if (!rid || !stats[rid]) continue;
    const s = stats[rid];
    if (['applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer', 'rejected', 'ghosted'].includes(opp.status)) {
      s.applications_count++;
    }
    if (['interviewing', 'offer'].includes(opp.status)) s.interviews_count++;
    if (opp.status === 'rejected') s.rejections_count++;
    if (['follow_up_1', 'follow_up_2', 'interviewing', 'offer'].includes(opp.status)) s.responses_count++;
  }

  for (const s of Object.values(stats)) {
    if (s.applications_count > 0) {
      s.response_rate = Math.round((s.responses_count / s.applications_count) * 100);
      s.interview_rate = Math.round((s.interviews_count / s.applications_count) * 100);
    }
  }

  return Object.values(stats);
}

// ─── Vault mutation helpers (pure — no side effects) ──────────────────────────

/**
 * Apply an update to a single vault record. Returns updated vault array.
 * Use this to archive, activate, or relabel a resume.
 *
 * @param {Array} vault - current vault
 * @param {string} resumeId - id of the resume to update
 * @param {object} updates - fields to update (status, display_name, notes, version_label, quality_score)
 * @returns {Array} updated vault
 */
export function updateVaultRecord(vault, resumeId, updates) {
  const v = vault || INITIAL_VAULT;
  const ALLOWED_KEYS = ['status', 'display_name', 'notes', 'version_label', 'quality_score', 'domain_tags', 'is_canonical'];
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => ALLOWED_KEYS.includes(k))
  );
  // Validate status if provided
  if (safeUpdates.status && !Object.values(VAULT_STATUS).includes(safeUpdates.status)) {
    throw new Error(`Invalid vault status: ${safeUpdates.status}. Valid: ${Object.values(VAULT_STATUS).join(', ')}`);
  }
  return v.map(r =>
    r.id === resumeId
      ? { ...r, ...safeUpdates, updated_at: new Date().toISOString() }
      : r
  );
}

/**
 * Reset vault to INITIAL_VAULT defaults.
 * Returns a fresh copy of INITIAL_VAULT.
 */
export function resetVaultToDefaults() {
  return INITIAL_VAULT.map(r => ({ ...r }));
}
