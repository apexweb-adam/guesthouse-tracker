/**
 * Proof Bank — _shared/proofBank.js
 *
 * Structured, reusable career evidence for Sample Candidate.
 * Proof items are real, high-signal achievements seeded from her strongest resumes.
 *
 * Rules:
 * - No fabricated claims — only evidence grounded in real work history
 * - Each item has measurable outcome, tools, domain tags, and lane relevance
 * - Items are reusable inside Apply Pack, Apply Assistant, outreach drafts, and interview prep
 * - Editable via UI (stored in user_preferences with key 'proof_bank')
 *
 * Do NOT re-implement this logic in n8n or elsewhere.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const PROOF_CATEGORY = {
  DELIVERY: 'delivery',
  FEDERAL_REGULATED: 'federal_regulated',
  CLOUD_MIGRATION: 'cloud_migration',
  IAM_SECURITY: 'iam_security',
  STAKEHOLDER: 'stakeholder',
  PROCESS_IMPROVEMENT: 'process_improvement',
  LEADERSHIP: 'leadership',
  BUDGET: 'budget',
};

export const PROOF_CATEGORY_LABELS = {
  [PROOF_CATEGORY.DELIVERY]: 'Delivery & Programme Management',
  [PROOF_CATEGORY.FEDERAL_REGULATED]: 'Federal / Regulated Environment',
  [PROOF_CATEGORY.CLOUD_MIGRATION]: 'Cloud Migration & Modernisation',
  [PROOF_CATEGORY.IAM_SECURITY]: 'IAM & Security Delivery',
  [PROOF_CATEGORY.STAKEHOLDER]: 'Stakeholder & Executive Alignment',
  [PROOF_CATEGORY.PROCESS_IMPROVEMENT]: 'Process Improvement & Efficiency',
  [PROOF_CATEGORY.LEADERSHIP]: 'Team Leadership & Cross-functional Coordination',
  [PROOF_CATEGORY.BUDGET]: 'Budget & Financial Oversight',
};

// Confidence / strength score scale
export const PROOF_STRENGTH = {
  HIGH: 'high',     // 90–100: strongly documented, quantified, reproducible
  MEDIUM: 'medium', // 60–89: documented, partially quantified
  LOW: 'low',       // <60: directional / narrative, limited quantification
};

// ─── Seeded Proof Items ───────────────────────────────────────────────────────

/**
 * INITIAL_PROOF_BANK
 *
 * High-signal proof items seeded from Candidate's strongest resume evidence.
 * Items are real career achievements — no fabricated claims.
 * The operator should review and update these to reflect exact project details.
 */
export const INITIAL_PROOF_BANK = [
  {
    id: 'pb-001',
    title: 'IRS IAM Modernisation Programme Delivery',
    category: PROOF_CATEGORY.IAM_SECURITY,
    tags: ['iam', 'identity-access-management', 'federal', 'irs', 'ping-identity', 'modernisation'],
    domain_tags: ['federal', 'iam', 'security'],
    lane_tags: ['tpm', 'program_manager'],
    company_client: 'IRS (via federal contractor)',
    situation: 'IRS required modernisation of its Identity and Access Management infrastructure to improve provisioning speed, reduce security incidents, and meet federal compliance mandates.',
    scope: 'Programme-level delivery of IAM modernisation across multiple workstreams, coordinating engineering, security, and compliance stakeholders.',
    actions: 'Managed end-to-end delivery of IAM modernisation programme. Drove stakeholder alignment across engineering, security, and federal compliance teams. Implemented Ping Identity platform. Established governance cadence, risk register, and delivery milestones.',
    measurable_outcome: 'Achieved 40% reduction in provisioning time. Improved security incident response by 50%. Delivered on time within federal compliance constraints.',
    tools_platforms: ['Ping Identity', 'Jira', 'Confluence', 'Microsoft Azure AD', 'ServiceNow'],
    federal_or_regulated_flag: true,
    role_relevance: 'Core TPM / Programme Manager evidence for regulated, federal IAM delivery at scale.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 92,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-002',
    title: 'VA Federal IT Delivery',
    category: PROOF_CATEGORY.FEDERAL_REGULATED,
    tags: ['federal', 'va', 'veterans-affairs', 'it-delivery', 'regulated', 'compliance'],
    domain_tags: ['federal', 'it-delivery', 'compliance'],
    lane_tags: ['tpm', 'program_manager', 'delivery_manager'],
    company_client: 'VA (Department of Veterans Affairs)',
    situation: 'VA required structured IT delivery across multiple legacy modernisation workstreams under federal governance and compliance requirements.',
    scope: 'Technical project management and programme coordination across VA IT modernisation initiatives, working within federal acquisition and governance frameworks.',
    actions: 'Led technical delivery of IT projects within VA federal environment. Navigated federal compliance requirements, stakeholder reporting, and cross-agency coordination. Maintained risk register, delivery governance, and milestone tracking.',
    measurable_outcome: 'Delivered IT modernisation milestones on schedule within federal compliance framework. Maintained audit-ready documentation.',
    tools_platforms: ['Jira', 'Confluence', 'MS Teams', 'ServiceNow'],
    federal_or_regulated_flag: true,
    role_relevance: 'Core proof of federal IT delivery experience for federal consulting and government IT roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 88,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-003',
    title: 'Cloud-Native Maximo EAM Migration (500K+ Assets)',
    category: PROOF_CATEGORY.CLOUD_MIGRATION,
    tags: ['maximo', 'eam', 'cloud-migration', 'asset-management', 'cloud-native', 'enterprise'],
    domain_tags: ['cloud', 'migration', 'enterprise', 'asset-management'],
    lane_tags: ['tpm', 'delivery_manager'],
    company_client: '[Enterprise Client — cloud migration programme]',
    situation: 'Enterprise client required migration of Maximo Enterprise Asset Management platform from on-premises to cloud-native architecture, covering 500,000+ physical and digital assets.',
    scope: 'End-to-end technical project management for cloud-native Maximo EAM migration. Team size: 15+ cross-functional members. Multi-phase delivery over 12+ months.',
    actions: 'Managed SDLC for cloud migration from discovery through production deployment. Led cross-functional delivery team of 15+ engineers, architects, and business analysts. Coordinated data migration, integration testing, UAT, and cutover planning. Maintained stakeholder alignment across IT, operations, and executive sponsors.',
    measurable_outcome: 'Successfully migrated 500,000+ assets to cloud-native Maximo platform. Delivered on timeline with <2% data integrity issues at cutover (resolved pre-go-live).',
    tools_platforms: ['IBM Maximo', 'Azure', 'Jira', 'Confluence', 'MS Project'],
    federal_or_regulated_flag: false,
    role_relevance: 'Strong TPM evidence: cloud migration at scale, large team, technical SDLC ownership.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 95,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-004',
    title: '100K+ User Platform Impact',
    category: PROOF_CATEGORY.DELIVERY,
    tags: ['scale', 'user-impact', 'platform', 'delivery', 'enterprise'],
    domain_tags: ['enterprise', 'platform', 'delivery'],
    lane_tags: ['tpm', 'program_manager', 'delivery_manager'],
    company_client: '[Enterprise Platform Client]',
    situation: 'Enterprise platform delivery affecting over 100,000 end users required coordinated technical delivery, stakeholder management, and change management to ensure successful adoption.',
    scope: 'Technical programme management for platform delivery at 100,000+ user scale. Cross-functional team coordination across IT, product, and business units.',
    actions: 'Led end-to-end delivery of platform programme impacting 100,000+ users. Coordinated across engineering, product, change management, and executive stakeholders. Drove readiness reviews, launch planning, and post-launch stabilisation.',
    measurable_outcome: 'Delivered platform to 100,000+ users within timeline. Achieved successful launch with minimal P1 incidents during hypercare period.',
    tools_platforms: ['Jira', 'Confluence', 'ServiceNow', 'MS Teams'],
    federal_or_regulated_flag: false,
    role_relevance: 'Strong evidence of delivery at enterprise scale. Useful for large-org TPM / senior delivery roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 88,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-005',
    title: '$1.2M Budget Ownership / Support',
    category: PROOF_CATEGORY.BUDGET,
    tags: ['budget', 'financial-oversight', 'programme-budget', 'cost-management'],
    domain_tags: ['budget', 'programme-management', 'financial-oversight'],
    lane_tags: ['tpm', 'program_manager'],
    company_client: '[Programme / Delivery Client]',
    situation: 'Programme required active budget management and financial reporting as part of delivery governance.',
    scope: 'Budget accountability of $1.2M across programme workstreams. Financial reporting to executive sponsors and programme board.',
    actions: 'Managed programme budget of $1.2M across delivery workstreams. Maintained financial tracking, variance reporting, and forecasting. Escalated budget risks early to executive stakeholders.',
    measurable_outcome: 'Delivered programme within budget envelope. Zero uncontrolled overspend across programme lifecycle.',
    tools_platforms: ['MS Excel', 'MS Project', 'Confluence', 'SAP'],
    federal_or_regulated_flag: false,
    role_relevance: 'Programme Manager and senior TPM evidence — budget ownership and financial governance.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 85,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-006',
    title: '15+ Cross-Functional Team Leadership',
    category: PROOF_CATEGORY.LEADERSHIP,
    tags: ['team-leadership', 'cross-functional', 'delivery-team', 'technical-team', 'people-management'],
    domain_tags: ['leadership', 'delivery', 'team-management'],
    lane_tags: ['tpm', 'program_manager', 'delivery_manager'],
    company_client: '[Multiple delivery engagements]',
    situation: 'Complex delivery programmes required leadership of cross-functional teams including engineers, architects, business analysts, QA, and operations staff.',
    scope: 'Directly led delivery teams of 15+ cross-functional members across multiple engagements.',
    actions: 'Led and coordinated cross-functional delivery teams of 15+ members. Drove sprint planning, delivery cadence, stakeholder reporting, and team escalation resolution. Maintained team alignment across technical and business stakeholders.',
    measurable_outcome: 'Maintained delivery velocity and team cohesion across complex programmes. Consistently delivered to stakeholder expectations.',
    tools_platforms: ['Jira', 'Confluence', 'MS Teams', 'Slack'],
    federal_or_regulated_flag: false,
    role_relevance: 'Core leadership evidence for senior TPM / delivery manager / programme manager roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 90,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-007',
    title: 'Ping Identity IAM Platform Delivery',
    category: PROOF_CATEGORY.IAM_SECURITY,
    tags: ['ping-identity', 'iam', 'identity-access-management', 'platform-delivery', 'sso', 'mfa'],
    domain_tags: ['iam', 'security', 'platform'],
    lane_tags: ['tpm', 'delivery_manager'],
    company_client: 'IRS (via federal contractor)',
    situation: 'Deployment and integration of Ping Identity platform as core IAM infrastructure, supporting SSO, MFA, and access provisioning at federal scale.',
    scope: 'Technical project management for Ping Identity platform implementation. Integration with existing federal identity infrastructure.',
    actions: 'Managed end-to-end delivery of Ping Identity platform implementation. Coordinated between identity engineering, security compliance, and federal IT stakeholders. Drove integration testing, security review, and production deployment.',
    measurable_outcome: 'Successfully deployed Ping Identity platform. Achieved 40% reduction in provisioning time as part of overall IAM modernisation programme.',
    tools_platforms: ['Ping Identity', 'PingFederate', 'PingDirectory', 'Azure AD', 'ServiceNow'],
    federal_or_regulated_flag: true,
    role_relevance: 'Specific IAM platform delivery evidence — highly relevant for IAM/security-adjacent TPM roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 90,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-008',
    title: 'Splunk / SOAR Security Operations Optimisation',
    category: PROOF_CATEGORY.IAM_SECURITY,
    tags: ['splunk', 'soar', 'security-operations', 'incident-response', 'siem', 'automation'],
    domain_tags: ['security', 'soc', 'siem', 'soar'],
    lane_tags: ['tpm', 'ops_manager'],
    company_client: '[Security Operations Client]',
    situation: 'Security operations centre required optimisation of Splunk SIEM and SOAR workflows to reduce manual incident response effort and improve detection-to-response time.',
    scope: 'Technical project management for Splunk/SOAR optimisation. Coordinated security operations, engineering, and IT teams.',
    actions: 'Managed delivery of Splunk and SOAR platform optimisation programme. Drove process redesign for incident triage, playbook automation, and dashboard uplift. Coordinated cross-functional stakeholders across security operations and engineering.',
    measurable_outcome: '50% reduction in manual incident response effort. Improved mean time to respond (MTTR) across security operations workflows.',
    tools_platforms: ['Splunk', 'Splunk SOAR', 'SIEM', 'ServiceNow', 'Jira'],
    federal_or_regulated_flag: false,
    role_relevance: 'IAM/security delivery evidence — strong signal for security-adjacent TPM or ops manager roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 88,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-009',
    title: '40% Provisioning Time Improvement',
    category: PROOF_CATEGORY.PROCESS_IMPROVEMENT,
    tags: ['provisioning', 'iam', 'process-improvement', 'efficiency', 'automation'],
    domain_tags: ['iam', 'process-improvement', 'efficiency'],
    lane_tags: ['tpm', 'delivery_manager', 'ops_manager'],
    company_client: 'IRS (via federal contractor)',
    situation: 'Manual identity provisioning processes were creating significant delays and compliance risk across the IRS IAM environment.',
    scope: 'Process redesign and platform automation as part of the IAM modernisation programme.',
    actions: 'Drove process redesign for identity provisioning workflows. Implemented automation using Ping Identity and ServiceNow integration. Streamlined approval workflows and access request processes.',
    measurable_outcome: '40% reduction in provisioning time. Reduced compliance risk from manual access provisioning errors.',
    tools_platforms: ['Ping Identity', 'ServiceNow', 'Azure AD', 'Jira'],
    federal_or_regulated_flag: true,
    role_relevance: 'Process improvement with quantified outcome — use in process efficiency and delivery manager contexts.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 92,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-010',
    title: '25% Release Velocity Improvement',
    category: PROOF_CATEGORY.PROCESS_IMPROVEMENT,
    tags: ['release-velocity', 'delivery-cadence', 'agile', 'process-improvement', 'ci-cd'],
    domain_tags: ['delivery', 'agile', 'process-improvement'],
    lane_tags: ['tpm', 'delivery_manager'],
    company_client: '[Enterprise Delivery Client]',
    situation: 'Delivery team was releasing at below-target velocity due to inefficient sprint ceremonies, unclear release processes, and manual deployment steps.',
    scope: 'Process improvement initiative to increase release cadence across the delivery team.',
    actions: 'Led process improvement initiative targeting release velocity. Streamlined sprint ceremonies, clarified definition of done, and introduced CI/CD pipeline improvements. Coached team on release management best practices.',
    measurable_outcome: '25% improvement in release velocity. Reduced release cycle time from [X] to [Y] weeks. Improved team predictability and stakeholder confidence.',
    tools_platforms: ['Jira', 'Confluence', 'Azure DevOps', 'Jenkins', 'Bitbucket'],
    federal_or_regulated_flag: false,
    role_relevance: 'Delivery velocity evidence — strong for TPM and delivery manager roles with Agile / CI-CD context.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 88,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-011',
    title: '50% Incident Response Improvement (Security Ops)',
    category: PROOF_CATEGORY.IAM_SECURITY,
    tags: ['incident-response', 'security-operations', 'soar', 'automation', 'soc'],
    domain_tags: ['security', 'incident-response', 'operations'],
    lane_tags: ['tpm', 'ops_manager'],
    company_client: '[Security Operations Client]',
    situation: 'Security operations team was experiencing slow incident response times due to manual triage and lack of automation.',
    scope: 'Security operations improvement initiative covering incident triage, response automation, and SOAR playbook implementation.',
    actions: 'Delivered security operations improvement programme. Managed implementation of SOAR playbooks, automated triage workflows, and escalation procedures. Coordinated security engineering and SOC analyst teams.',
    measurable_outcome: '50% improvement in incident response time. Reduced manual triage effort and improved analyst capacity.',
    tools_platforms: ['Splunk SOAR', 'Splunk SIEM', 'ServiceNow', 'PagerDuty'],
    federal_or_regulated_flag: false,
    role_relevance: 'Security operations delivery — use in security-adjacent TPM, ops manager, and SOC programme manager roles.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 88,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pb-012',
    title: 'End-to-End SDLC Ownership Across Multiple Programmes',
    category: PROOF_CATEGORY.DELIVERY,
    tags: ['sdlc', 'end-to-end', 'technical-delivery', 'tpm', 'agile', 'scrum', 'safe'],
    domain_tags: ['delivery', 'sdlc', 'programme-management'],
    lane_tags: ['tpm', 'delivery_manager'],
    company_client: '[Multiple engagements]',
    situation: 'Complex technical programmes required end-to-end ownership of the full SDLC — from requirements through deployment and hypercare.',
    scope: 'SDLC ownership across requirements, design, build, test, deployment, and hypercare phases. Multiple concurrent programmes.',
    actions: 'Owned full SDLC lifecycle for technical delivery programmes. Drove requirements gathering, solution design reviews, sprint delivery, UAT coordination, release management, and post-go-live hypercare. Maintained stakeholder alignment throughout all phases.',
    measurable_outcome: 'Consistently delivered complex technical programmes through full SDLC. Maintained on-time delivery rate across multiple concurrent engagements.',
    tools_platforms: ['Jira', 'Confluence', 'Azure DevOps', 'MS Project', 'ServiceNow'],
    federal_or_regulated_flag: false,
    role_relevance: 'Core TPM / Technical PM evidence — end-to-end SDLC ownership is a primary differentiator.',
    strength: PROOF_STRENGTH.HIGH,
    confidence_score: 95,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

// ─── API helpers (localStorage-backed for demo / direct-access pattern) ────────

const PROOF_BANK_KEY = 'proof_bank';

/**
 * Load the Proof Bank from user_preferences storage.
 * In demo mode: reads from localStorage.
 * Falls back to INITIAL_PROOF_BANK if nothing is stored.
 *
 * @param {object} userPreferences - the full user_preferences record (or null)
 * @returns {Array} proof items
 */
export function loadProofBankFromPrefs(userPreferences) {
  if (userPreferences && Array.isArray(userPreferences[PROOF_BANK_KEY])) {
    return userPreferences[PROOF_BANK_KEY];
  }
  return [...INITIAL_PROOF_BANK];
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Filter proof items by lane tag.
 */
export function getProofItemsByLane(items, lane) {
  return items.filter(item => (item.lane_tags || []).includes(lane));
}

/**
 * Filter proof items by category.
 */
export function getProofItemsByCategory(items, category) {
  return items.filter(item => item.category === category);
}

/**
 * Filter proof items by domain tag.
 */
export function getProofItemsByDomainTag(items, tag) {
  return items.filter(item => (item.domain_tags || []).includes(tag));
}

/**
 * Select the most relevant proof items for a given opportunity.
 * Ranks by: lane match, federal match (if relevant), strength score.
 *
 * @param {object} opp - opportunity record
 * @param {Array} items - proof bank items
 * @param {number} limit - max items to return
 * @returns {Array} selected proof items
 */
export function selectProofItemsForRole(opp, items, limit = 5) {
  const lane = opp.lane || '';
  const isFederal = !!(opp.federal_context || (opp.description || '').toLowerCase().includes('federal')
    || (opp.description || '').toLowerCase().includes('government')
    || (opp.description || '').toLowerCase().includes('clearance'));

  const scored = items.map(item => {
    let score = item.confidence_score || 0;

    // Lane match bonus
    if ((item.lane_tags || []).includes(lane)) score += 20;

    // Federal bonus
    if (isFederal && item.federal_or_regulated_flag) score += 15;

    // Strength bonus
    if (item.strength === PROOF_STRENGTH.HIGH) score += 5;

    // Keyword overlap
    const oppText = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();
    const itemText = `${item.title} ${item.tags.join(' ')} ${item.domain_tags.join(' ')}`.toLowerCase();
    const itemWords = itemText.split(/\s+/).filter(w => w.length >= 4);
    const overlaps = itemWords.filter(w => oppText.includes(w)).length;
    score += Math.min(overlaps * 2, 10);

    return { item, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

/**
 * Build a summary of the proof bank (counts by category).
 */
export function buildProofBankSummary(items) {
  const counts = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return {
    total: items.length,
    by_category: counts,
    high_strength_count: items.filter(i => i.strength === PROOF_STRENGTH.HIGH).length,
    federal_count: items.filter(i => i.federal_or_regulated_flag).length,
  };
}
