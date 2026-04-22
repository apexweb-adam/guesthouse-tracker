/**
 * Candidate Profile Vault — src/lib/candidateProfile.js
 *
 * Structured personal/application data for Sample Candidate.
 * Used by the Apply Assistant tab to populate copy-paste fields.
 *
 * Storage: localStorage (key = CANDIDATE_PROFILE_KEY).
 * Seeded with verified defaults on first load.
 * Fields marked needs_confirmation must be reviewed before use.
 *
 * No secrets, no server calls. All browser-local.
 */

export const CANDIDATE_PROFILE_KEY = 'job-search-os-candidate-profile-v1';

// ─── Default profile seed ─────────────────────────────────────────────────────
// VERIFIED fields are safe to copy/paste immediately.
// NEEDS CONFIRMATION fields must be reviewed and confirmed before use.

export const DEFAULT_CANDIDATE_PROFILE = {
  // ── A. Personal ────────────────────────────────────────────────────────────
  full_name: 'Sample Candidate',
  preferred_name: 'Candidate',
  email: 'candidate@example.com',
  phone: '(+1 555 0100',
  location_city: 'Fairfax',
  location_state: 'VA',
  location: 'United States',
  full_address: '',                 // needs_confirmation — do not prefill
  linkedin_url: '',                 // populate from real resume/profile if available
  portfolio_url: '',

  // ── B. Eligibility ─────────────────────────────────────────────────────────
  work_authorized_us: true,
  work_authorization: 'U.S. Citizen',
  citizenship_status: 'U.S. Citizen',
  needs_sponsorship: false,
  visa_sponsorship_needed: 'No',
  clearance_level: 'Public Trust',
  security_clearance: 'U.S. Citizen with Public Trust clearance.',

  // ── C. Preferences — needs confirmation ───────────────────────────────────
  salary_expectation: '',           // needs_confirmation
  notice_period: '',                // needs_confirmation
  earliest_start_date: '',          // needs_confirmation
  remote_preference: '',            // needs_confirmation
  hybrid_preference: '',            // needs_confirmation
  onsite_preference: '',            // needs_confirmation
  relocation_preference: '',        // needs_confirmation

  // ── D. Professional defaults ───────────────────────────────────────────────
  primary_lane: 'Technical Project Manager',
  secondary_lane: 'IT Project Manager',
  fallback_lane: 'Program Manager',
  default_resume_tpm: 'rv-tpm-01',
  default_resume_it_pm: 'rv-it-pm-01',
  default_resume_program: 'rv-program-01',
  core_certifications: ['PMP', 'CAPM', 'CSM', 'ITIL 4', 'Security+'],
  top_domain_tags: [
    'federal', 'cloud migration', 'IAM', 'cybersecurity',
    'Splunk', 'SOAR', 'Jenkins', 'FedRAMP', 'VA', 'IRS',
  ],

  // ── Short professional summary ─────────────────────────────────────────────
  short_bio: 'Technical Project Manager with deep experience delivering federal and enterprise technology initiatives across cloud migration, IAM modernization, cybersecurity, Splunk, and SOAR programs.',

  // ── Confirmation flags for changeable fields ───────────────────────────────
  // Fields with needs_confirmation: true require explicit review before use.
  _confirmation_state: {
    salary_expectation: 'needs_confirmation',
    notice_period: 'needs_confirmation',
    earliest_start_date: 'needs_confirmation',
    remote_preference: 'needs_confirmation',
    hybrid_preference: 'needs_confirmation',
    onsite_preference: 'needs_confirmation',
    relocation_preference: 'needs_confirmation',
    full_address: 'needs_confirmation',
    visa_sponsorship_needed: 'confirm_before_use',
    security_clearance: 'confirm_before_use',
  },

  // Updated at
  updated_at: null,
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function loadCandidateProfile() {
  try {
    const raw = localStorage.getItem(CANDIDATE_PROFILE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      // Merge with defaults so new fields appear automatically
      return {
        ...DEFAULT_CANDIDATE_PROFILE,
        ...stored,
        _confirmation_state: {
          ...DEFAULT_CANDIDATE_PROFILE._confirmation_state,
          ...(stored._confirmation_state || {}),
        },
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CANDIDATE_PROFILE };
}

export function saveCandidateProfile(updates) {
  const current = loadCandidateProfile();
  const merged = {
    ...current,
    ...updates,
    _confirmation_state: {
      ...current._confirmation_state,
      ...(updates._confirmation_state || {}),
    },
    updated_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(CANDIDATE_PROFILE_KEY, JSON.stringify(merged));
  } catch { /* ignore */ }
  return merged;
}

export function resetCandidateProfile() {
  const fresh = { ...DEFAULT_CANDIDATE_PROFILE, updated_at: new Date().toISOString() };
  try {
    localStorage.setItem(CANDIDATE_PROFILE_KEY, JSON.stringify(fresh));
  } catch { /* ignore */ }
  return fresh;
}

// ─── Common Question Bank ─────────────────────────────────────────────────────
// Reusable answer templates for standard ATS / application questions.
// Review and personalise each answer before submitting.

export const COMMON_QUESTION_BANK = [
  {
    id: 'q-work-auth',
    category: 'Eligibility',
    question: 'Are you authorized to work in the United States?',
    answer: 'I am authorized to work in the United States.',
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-sponsorship',
    category: 'Eligibility',
    question: 'Do you require employment sponsorship?',
    answer: 'I do not currently require employment sponsorship.',
    editable: true,
    confirmed: false,
    note: 'Confirm before use — edit if circumstances have changed.',
  },
  {
    id: 'q-clearance',
    category: 'Eligibility',
    question: 'Do you hold a security clearance?',
    answer: 'U.S. Citizen with Public Trust clearance.',
    editable: true,
    confirmed: true,
    note: 'Verify exact wording required by the form before submitting.',
  },
  {
    id: 'q-notice',
    category: 'Availability',
    question: 'What is your notice period?',
    answer: '[Confirm before use — fill in your actual notice period]',
    editable: true,
    confirmed: false,
    note: 'Needs confirmation — do not use placeholder.',
  },
  {
    id: 'q-salary',
    category: 'Compensation',
    question: 'What are your salary expectations?',
    answer: '[Confirm before use — fill in your target range]',
    editable: true,
    confirmed: false,
    note: 'Needs confirmation — research market rate and confirm.',
  },
  {
    id: 'q-remote',
    category: 'Preferences',
    question: 'What are your remote / flexible work preferences?',
    answer: '[Confirm before use — fill in your preference for this specific role]',
    editable: true,
    confirmed: false,
    note: 'Needs confirmation — varies by role and personal preference.',
  },
  {
    id: 'q-tell-about-yourself',
    category: 'About You',
    question: 'Tell us about yourself / professional summary.',
    answer: `I'm a Technical Project Manager with strong experience leading cross-functional delivery in federal and enterprise environments, especially across cloud migration, identity and access management, and cybersecurity-related programs. My background includes leading complex technical initiatives involving large-scale migrations, stakeholder coordination, delivery governance, and measurable operational improvements.`,
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-pm-experience',
    category: 'Experience',
    question: 'Describe your project management experience.',
    answer: `Technical Project Manager with deep experience delivering federal and enterprise technology initiatives across cloud migration, IAM modernization, cybersecurity, Splunk, and SOAR programs.

Key highlights:
• Led cross-functional delivery teams in federal and enterprise environments
• Delivered cloud migration, IAM modernization, and cybersecurity-focused programs
• Applied Agile (Scrum/CSM) and structured waterfall frameworks as required
• Managed complex stakeholder landscapes including federal agency leads and vendors
• PMP and CAPM certified; strong in risk, delivery governance, and change management

[Personalise with specific metrics and program names before submitting.]`,
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-agile',
    category: 'Experience',
    question: 'Describe your experience with Agile / Scrum.',
    answer: `I have led Agile delivery across federal and enterprise programs using Scrum and Kanban frameworks, holding a CSM (Certified Scrum Master) certification.

Responsibilities included: sprint planning and retrospectives, backlog prioritisation, velocity tracking, dependency management, and release governance.

I have applied Agile delivery in compliance-sensitive environments with strong stakeholder coordination and audit requirements.

[Add a specific example or metric before submitting.]`,
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-federal',
    category: 'Experience',
    question: 'Describe your experience in federal / regulated environments.',
    answer: `My experience includes delivering work in highly regulated environments with strong security, compliance, and stakeholder-governance requirements, including federal programs and enterprise security initiatives.

I have worked within environments requiring FedRAMP compliance, federal agency governance, and security clearance protocols.

[Add specific agency or program details if permitted.]`,
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-iam-cloud',
    category: 'Technical',
    question: 'Describe your experience with IAM / cloud / cybersecurity.',
    answer: `I have experience supporting and delivering IAM and security-related initiatives, including Ping Identity implementations, Splunk optimization, and SOAR-related delivery work across federal and enterprise environments.

On the cloud side, my experience includes leading large-scale cloud migration work involving cross-functional coordination, delivery planning, stakeholder engagement, data migration, and operational readiness.

Security experience includes delivery of IAM modernization, Splunk optimization, and SOAR-related programs in federal environments requiring FedRAMP compliance.

[Personalise with specific technologies and programs before submitting.]`,
    editable: true,
    confirmed: true,
  },
  {
    id: 'q-why-role',
    category: 'Motivation',
    question: 'Why are you interested in this role?',
    answer: `This role is a strong fit for my background because it combines cross-functional technical delivery with stakeholder coordination, execution discipline, and risk management. My recent experience across cloud, IAM, and security-focused programs aligns well with the kind of delivery ownership this position requires.

[Personalise with specific details from the job description before submitting.]`,
    editable: true,
    confirmed: false,
    note: 'Role-specific — always personalise before submitting.',
  },
  {
    id: 'q-why-company',
    category: 'Motivation',
    question: 'Why do you want to work for this company?',
    answer: `I'm interested in this company because the role sits at the intersection of technical delivery, operational impact, and cross-functional collaboration. I'm particularly drawn to environments where project leadership directly supports meaningful infrastructure, security, or transformation outcomes.

[Research the company and add specific, genuine reasons before submitting.]`,
    editable: true,
    confirmed: false,
    note: 'Company-specific — always personalise before submitting.',
  },
];

// ─── Question bank helpers ────────────────────────────────────────────────────

export const QUESTION_BANK_STORAGE_KEY = 'job-search-os-question-bank-v1';

export function loadQuestionBank() {
  try {
    const raw = localStorage.getItem(QUESTION_BANK_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      // Merge: keep saved edits, add any new default questions
      const storedById = Object.fromEntries(stored.map(q => [q.id, q]));
      return COMMON_QUESTION_BANK.map(q => ({
        ...q,
        ...(storedById[q.id] ? { answer: storedById[q.id].answer } : {}),
      }));
    }
  } catch { /* ignore */ }
  return COMMON_QUESTION_BANK.map(q => ({ ...q }));
}

export function saveQuestionBankItem(id, answer) {
  const current = loadQuestionBank();
  const updated = current.map(q => q.id === id ? { ...q, answer } : q);
  try {
    localStorage.setItem(QUESTION_BANK_STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
  return updated;
}

export function resetQuestionBank() {
  try {
    localStorage.removeItem(QUESTION_BANK_STORAGE_KEY);
  } catch { /* ignore */ }
  return COMMON_QUESTION_BANK.map(q => ({ ...q }));
}

// ─── Question bank category list ──────────────────────────────────────────────

export const QUESTION_BANK_CATEGORIES = [
  'Eligibility',
  'Availability',
  'Compensation',
  'Preferences',
  'About You',
  'Experience',
  'Technical',
  'Motivation',
];

// ─── Confirmation state helpers ───────────────────────────────────────────────

export const NEEDS_CONFIRMATION_FIELDS = [
  'salary_expectation',
  'notice_period',
  'earliest_start_date',
  'remote_preference',
  'hybrid_preference',
  'onsite_preference',
  'relocation_preference',
  'full_address',
  'visa_sponsorship_needed',
  'security_clearance',
];

export function fieldNeedsConfirmation(fieldKey, profile) {
  const state = profile?._confirmation_state?.[fieldKey];
  return state === 'needs_confirmation' || state === 'confirm_before_use';
}

