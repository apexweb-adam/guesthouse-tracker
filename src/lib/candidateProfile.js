/**
 * Candidate Profile Vault — src/lib/candidateProfile.js
 *
 * Structured personal/application data for Sample Candidate.
 * Used by the Apply Assistant tab to populate copy-paste fields.
 *
 * Storage: localStorage (key = CANDIDATE_PROFILE_KEY).
 * Seeded with sensible defaults on first load.
 * User can edit and save edits — edits persist in localStorage.
 *
 * No secrets, no server calls. All browser-local.
 */

export const CANDIDATE_PROFILE_KEY = 'job-search-os-candidate-profile-v1';

// ─── Default profile seed ─────────────────────────────────────────────────────
// Candidate can update these via the Apply Assistant panel.

export const DEFAULT_CANDIDATE_PROFILE = {
  // Personal details
  full_name: 'Sample Candidate',
  preferred_name: 'Candidate',
  email: '[your-email@example.com]',
  phone: '[your-phone]',
  location: 'Sydney, NSW, Australia',
  full_address: '[Your full address if required]',

  // Links
  linkedin: '[https://www.linkedin.com/in/candidate]',
  portfolio: '',
  website: '',
  github: '',

  // Work eligibility
  work_authorization: 'Australian Citizen / Permanent Resident',
  visa_sponsorship_needed: 'No',
  security_clearance: 'NV1 (active / eligible)',
  notice_period: '2 weeks (negotiable)',
  remote_preference: 'Hybrid preferred (3 days in office)',
  relocation_preference: 'Open to relocation within Australia',

  // Compensation
  salary_expectation: '[Your target range, e.g. $130,000–$160,000 + super]',
  salary_basis: 'AUD annual, excluding superannuation',

  // Standard screening
  standard_screening: {
    right_to_work: 'Yes — Australian citizen / permanent resident. No sponsorship required.',
    criminal_check: 'Happy to consent to any required background or criminal checks.',
    security_clearance_detail: 'Currently hold NV1 clearance. Available to discuss further.',
    years_pm_experience: '8+ years of project and program management experience.',
    pmp_certification: 'PMP certified (Project Management Professional).',
    agile_experience: 'Extensive experience with Agile, Scrum, and SAFe across enterprise and government projects.',
  },

  // Short bio (for "Tell us about yourself")
  short_bio: `Senior Technical and IT Project Manager with 8+ years delivering complex digital transformation, infrastructure, and security programmes. Strong background in SDLC, Agile, stakeholder management, and federal/government sector delivery. PMP certified.`,

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
      return { ...DEFAULT_CANDIDATE_PROFILE, ...stored };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CANDIDATE_PROFILE };
}

export function saveCandidateProfile(updates) {
  const current = loadCandidateProfile();
  const merged = {
    ...current,
    ...updates,
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
// These are starting points — Candidate should review and personalise before submitting.

export const COMMON_QUESTION_BANK = [
  {
    id: 'q-work-auth',
    category: 'Eligibility',
    question: 'Are you authorised to work in Australia?',
    answer: 'Yes — Australian citizen / permanent resident. No visa sponsorship required.',
    editable: true,
  },
  {
    id: 'q-sponsorship',
    category: 'Eligibility',
    question: 'Do you require visa sponsorship?',
    answer: 'No. I am an Australian citizen / permanent resident and do not require sponsorship.',
    editable: true,
  },
  {
    id: 'q-notice',
    category: 'Availability',
    question: 'What is your notice period?',
    answer: '2 weeks, though I am open to discussing start date flexibility depending on the role and urgency.',
    editable: true,
  },
  {
    id: 'q-salary',
    category: 'Compensation',
    question: 'What are your salary expectations?',
    answer: '[State your target range, e.g. $130,000–$160,000 + super] — open to discussion based on the full package, scope, and growth opportunity.',
    editable: true,
  },
  {
    id: 'q-clearance',
    category: 'Eligibility',
    question: 'Do you hold a security clearance?',
    answer: 'Yes — I currently hold an NV1 security clearance and am happy to provide further details if required.',
    editable: true,
  },
  {
    id: 'q-remote',
    category: 'Preferences',
    question: 'What are your remote / flexible work preferences?',
    answer: 'I am open to hybrid arrangements (typically 3 days in office) and am flexible to match the team\'s ways of working. I have successfully delivered projects fully remote and in hybrid environments.',
    editable: true,
  },
  {
    id: 'q-tell-about-yourself',
    category: 'About You',
    question: 'Tell us about yourself / professional summary.',
    answer: `I am a Senior Technical and IT Project Manager with over 8 years of experience delivering complex digital transformation, infrastructure, and security programmes across government and enterprise environments.

My focus areas include: SDLC governance, Agile and SAFe delivery, IAM, cloud migrations, cybersecurity uplift, and large-scale stakeholder management. I am PMP certified and have a strong record of delivering projects on time, in scope, and within budget.

I am particularly drawn to roles where I can bridge technical and business stakeholders, drive rigorous governance, and deliver measurable outcomes.`,
    editable: true,
  },
  {
    id: 'q-pm-experience',
    category: 'Experience',
    question: 'Describe your project management experience.',
    answer: `8+ years of project and programme management experience across federal government, financial services, and technology sectors.

Key highlights:
• Delivered $10M+ digital transformation and platform modernisation programmes
• Led cross-functional teams of 15–40+ across government and enterprise
• Applied Agile (Scrum/SAFe) and waterfall delivery frameworks depending on context
• Managed complex stakeholder landscapes including C-suite, ministers, and procurement boards
• PMP certified; strong in risk, issue, and change management

[Personalise with your specific metrics and programmes before submitting.]`,
    editable: true,
  },
  {
    id: 'q-agile',
    category: 'Experience',
    question: 'Describe your experience with Agile / Scrum.',
    answer: `I have led Agile delivery across multiple enterprise and government programmes using Scrum, SAFe, and Kanban frameworks.

Responsibilities included: sprint planning and retrospectives, backlog prioritisation, velocity tracking, dependency management, and release cadence governance.

I have coached delivery teams transitioning from waterfall to Agile and have worked with scaled Agile frameworks (SAFe 5) across programmes with 5+ interdependent squads.

[Add a specific example or metric before submitting.]`,
    editable: true,
  },
  {
    id: 'q-gov-experience',
    category: 'Experience',
    question: 'Describe your experience working in government / federal sector.',
    answer: `I have delivered multiple programmes within the Australian federal government, navigating APS governance, procurement frameworks, and security requirements.

Key experience includes: managing vendor relationships and SOW governance, navigating government contracting cycles, working within security-conscious environments (clearance held), and presenting programme updates to SES and executive committees.

[Add agency/department name and specific programmes if permitted.]`,
    editable: true,
  },
  {
    id: 'q-iam-cloud',
    category: 'Technical',
    question: 'Describe your experience with IAM / cloud / cybersecurity.',
    answer: `I have managed delivery of IAM uplift and access governance programmes, coordinating across identity teams, security architects, and enterprise platform owners.

On the cloud side, I have project-managed migrations and platform modernisation programmes in AWS and Azure environments, working closely with cloud architects and engineers.

Security experience includes managing delivery of vulnerability remediation programmes, SIEM platform deployments (including Splunk), and aligning delivery to security frameworks (PSPF, ISM, ISO 27001).

[Personalise with specific technologies and programmes before submitting.]`,
    editable: true,
  },
  {
    id: 'q-why-role',
    category: 'Motivation',
    question: 'Why are you interested in this role?',
    answer: `[Role-specific — personalise this section]

This role aligns closely with my background in [technical / IT / programme delivery] and my interest in [company's sector / technology focus].

I am particularly drawn to [specific aspect of the role or company — e.g. the scale of the programme, the technical complexity, the governance mandate, or the team].

[Add 1–2 specific reasons based on the job description before submitting.]`,
    editable: true,
  },
  {
    id: 'q-why-company',
    category: 'Motivation',
    question: 'Why do you want to work for this company?',
    answer: `[Company-specific — personalise this section]

[Company Name]'s work in [their focus area] resonates with my experience and career goals. I admire [something specific about the company — mission, technology, culture, or scale].

I believe I can contribute meaningfully to [company's current challenges or initiatives] given my background in [relevant domain].

[Research the company and add specific, genuine reasons before submitting.]`,
    editable: true,
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
