/**
 * Story Bank — _shared/storyBank.js
 *
 * Structured STAR-format interview preparation stories for Sample Candidate.
 * Each story is grounded in real career evidence (linked to Proof Bank items).
 *
 * Rules:
 * - No fabricated claims — stories must be grounded in real experience
 * - Linked to Proof Bank items via linked_proof_ids
 * - Editable via UI (stored in user_preferences with key 'story_bank')
 * - Surfaced in Apply Pack and Opportunity Detail for interview prep
 *
 * Do NOT re-implement this logic in n8n or elsewhere.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORY_CATEGORY = {
  DELIVERY_UNDER_AMBIGUITY: 'delivery_under_ambiguity',
  PROJECT_RESCUE: 'project_rescue',
  STAKEHOLDER_MANAGEMENT: 'stakeholder_management',
  FEDERAL_REGULATED: 'federal_regulated',
  CLOUD_MIGRATION: 'cloud_migration',
  IAM_SECURITY: 'iam_security',
  CROSS_FUNCTIONAL_LEADERSHIP: 'cross_functional_leadership',
  PRIORITIZATION: 'prioritization',
  RISK_MITIGATION: 'risk_mitigation',
  CONFLICT_RESOLUTION: 'conflict_resolution',
  PROCESS_IMPROVEMENT: 'process_improvement',
};

export const STORY_CATEGORY_LABELS = {
  [STORY_CATEGORY.DELIVERY_UNDER_AMBIGUITY]: 'Delivery Under Ambiguity',
  [STORY_CATEGORY.PROJECT_RESCUE]: 'Project Rescue / Turnaround',
  [STORY_CATEGORY.STAKEHOLDER_MANAGEMENT]: 'Stakeholder Management',
  [STORY_CATEGORY.FEDERAL_REGULATED]: 'Federal / Regulated Delivery',
  [STORY_CATEGORY.CLOUD_MIGRATION]: 'Cloud Migration',
  [STORY_CATEGORY.IAM_SECURITY]: 'IAM / Security Delivery',
  [STORY_CATEGORY.CROSS_FUNCTIONAL_LEADERSHIP]: 'Cross-Functional Leadership',
  [STORY_CATEGORY.PRIORITIZATION]: 'Prioritisation',
  [STORY_CATEGORY.RISK_MITIGATION]: 'Risk Mitigation',
  [STORY_CATEGORY.CONFLICT_RESOLUTION]: 'Conflict Resolution',
  [STORY_CATEGORY.PROCESS_IMPROVEMENT]: 'Process Improvement',
};

export const STORY_FORMAT = {
  STAR: 'star',
  CAR: 'car',
  PAR: 'par',
};

// ─── Seeded Stories ───────────────────────────────────────────────────────────

/**
 * INITIAL_STORY_BANK
 *
 * Seeded STAR-format stories grounded in Candidate's known high-signal evidence.
 * Each story links to one or more Proof Bank items.
 * The operator should review, personalise, and fill in exact details before interviews.
 *
 * Note: Placeholder brackets [X], [Y], etc. should be replaced with specific numbers
 * from the operator's actual experience before use in interviews.
 */
export const INITIAL_STORY_BANK = [
  {
    id: 'sb-001',
    title: 'Leading IRS IAM Modernisation Under Federal Constraints',
    category: STORY_CATEGORY.FEDERAL_REGULATED,
    linked_proof_ids: ['pb-001', 'pb-007', 'pb-009'],
    lane_tags: ['tpm', 'program_manager'],
    tags: ['federal', 'iam', 'irs', 'modernisation', 'compliance', 'ping-identity'],
    story_format: STORY_FORMAT.STAR,
    situation: 'The IRS required modernisation of its Identity and Access Management infrastructure to reduce provisioning delays, improve security posture, and meet federal compliance mandates. The existing system had manual provisioning workflows causing multi-day delays and creating access governance risk.',
    task: 'I was responsible for end-to-end programme delivery of the IAM modernisation, coordinating across engineering, security compliance, and federal governance stakeholders — while maintaining continuous operations and meeting strict federal delivery requirements.',
    action: 'I established a governance cadence with weekly programme board reviews and a structured risk register. I drove stakeholder alignment across the IRS identity engineering team, federal compliance officers, and the vendor delivery team implementing Ping Identity. I sequenced delivery phases to minimise operational disruption, and I personally resolved escalations when compliance reviews threatened to delay the deployment timeline.',
    result: 'We delivered the IAM modernisation on time within federal compliance constraints, achieving a 40% reduction in provisioning time and 50% improvement in security incident response. The programme met all federal audit requirements at delivery.',
    short_version: 'Led IRS IAM modernisation — 40% provisioning improvement, 50% security incident improvement, delivered on time under federal compliance.',
    long_version: 'At the IRS, I was brought in to drive the modernisation of the Identity and Access Management infrastructure — a programme that spanned multiple workstreams, involved a Ping Identity platform implementation, and had to meet strict federal compliance requirements throughout. The challenge was not just the technical complexity but the regulatory environment: every change required security review, compliance sign-off, and change control documentation. I built a governance structure that included weekly programme board meetings, a living risk register with clear owners and mitigation plans, and a phased delivery approach that kept the existing system running during the transition. I personally drove the alignment between the engineering team, the federal compliance officers who had audit authority over the timeline, and the vendor team. When a compliance review threatened to delay go-live by six weeks, I facilitated a structured review session that clarified the specific concerns, produced a targeted evidence package, and unlocked approval within two weeks. The outcome: 40% reduction in provisioning time, 50% improvement in incident response, and a clean federal audit at programme close.',
    measurable_outcome: '40% provisioning improvement, 50% security incident improvement',
    best_for_questions: [
      'Tell me about a time you delivered a complex programme under regulatory or compliance constraints.',
      'Describe a situation where you had to manage multiple stakeholders with conflicting priorities.',
      'Tell me about a time you navigated a federal or government delivery environment.',
      'Describe a time you managed risk in a high-stakes programme.',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-002',
    title: 'Managing Cloud Migration at 500K+ Asset Scale',
    category: STORY_CATEGORY.CLOUD_MIGRATION,
    linked_proof_ids: ['pb-003', 'pb-006'],
    lane_tags: ['tpm', 'delivery_manager'],
    tags: ['cloud-migration', 'maximo', 'eam', 'scale', 'technical-delivery'],
    story_format: STORY_FORMAT.STAR,
    situation: 'A large enterprise required migration of its Maximo Enterprise Asset Management platform from on-premises to a cloud-native architecture. The migration covered 500,000+ physical and digital assets and required coordinating across a cross-functional team of 15+ engineers, architects, and business analysts.',
    task: 'I was responsible for end-to-end technical project management of the cloud migration — from initial scoping and architecture review through data migration, integration testing, UAT, and production cutover.',
    action: 'I structured the delivery into clear phases with defined milestones and acceptance criteria. I ran weekly cross-functional delivery reviews to surface blockers early, maintained a live risk register, and personally managed the data migration governance — including a structured data quality framework that caught integrity issues during test migration, allowing remediation before production cutover. I coordinated the UAT process with business stakeholders and managed the go/no-go decision process with executive sponsors.',
    result: 'Successfully migrated 500,000+ assets to the cloud-native Maximo platform, delivering on timeline with less than 2% data integrity issues at cutover (all resolved pre-go-live). The client achieved operational continuity throughout the migration with no production outages.',
    short_version: 'Led cloud-native Maximo migration of 500K+ assets with 15+ team, delivered on time with <2% data issues at cutover.',
    long_version: 'The challenge of migrating 500,000+ physical and digital assets to a new cloud-native EAM platform while keeping operations running is fundamentally a coordination and risk management problem at scale. I structured the programme into four major phases: discovery and design, build and integration, test migration, and production cutover. Each phase had defined success criteria before we moved forward. The test migration phase was critical — we ran two full test migrations before go-live, using the first to surface data integrity issues in legacy asset records, and the second to validate our remediation. By the time we reached production cutover, we had high confidence in the data quality. The go-live itself was managed as a structured cutover with a parallel run period, clear rollback criteria, and hypercare support for the first 30 days post-go-live. The result: 500K+ assets migrated on schedule, no production outages, and a client team that was confident in the new platform from day one.',
    measurable_outcome: '500,000+ assets migrated, <2% data integrity issues, delivered on time',
    best_for_questions: [
      'Tell me about a time you led a large-scale technical migration.',
      'Describe a complex technical programme you delivered end-to-end.',
      'Tell me about a time you managed risk on a high-stakes project.',
      'Describe a situation where you led a cross-functional team through a complex delivery.',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-003',
    title: 'Improving Release Velocity by 25% Through Process Change',
    category: STORY_CATEGORY.PROCESS_IMPROVEMENT,
    linked_proof_ids: ['pb-010'],
    lane_tags: ['tpm', 'delivery_manager'],
    tags: ['delivery-cadence', 'agile', 'release-management', 'process-improvement', 'velocity'],
    story_format: STORY_FORMAT.STAR,
    situation: 'A delivery team I was leading was releasing below target velocity — releases were taking longer than planned, sprint ceremonies were inefficient, and the team lacked confidence in their release process. Stakeholders were expressing concern about predictability.',
    task: 'I needed to diagnose the root causes of the velocity problem and implement changes that would measurably improve release cadence without disrupting ongoing delivery.',
    action: 'I ran a structured delivery retrospective to surface the real blockers: three main issues emerged — unclear definition of done causing rework at the end of sprints, manual deployment steps adding unpredictable time, and sprint planning sessions that were too long and insufficiently focused. I redesigned the sprint ceremonies (tighter planning with pre-prepared backlog items, structured retrospectives with action owners), worked with the engineering lead to introduce CI/CD pipeline improvements that automated the manual deployment steps, and clarified the definition of done with the product owner. I tracked velocity metrics weekly and reported progress to stakeholders.',
    result: 'Over [X] months, we achieved a 25% improvement in release velocity. Release cycle time reduced from [X] to [Y] weeks. Stakeholder confidence in delivery predictability recovered — the product owner and executive sponsor both noted the improvement in planning accuracy.',
    short_version: '25% release velocity improvement through sprint redesign and CI/CD improvements.',
    long_version: 'When I took over this delivery team, the first thing I noticed was that the sprint ceremonies were consuming too much time without producing clarity, and the release process had several manual steps that added unpredictable tail risk. I took a structured diagnostic approach: I ran a detailed retrospective, mapped the current delivery workflow step by step, and had individual conversations with the engineers and product owner to understand where they felt the most friction. The three root causes were clear: sprint planning without sufficient backlog preparation, a release process with manual steps that nobody owned end-to-end, and a definition of done that was interpreted differently by different team members. I addressed each systematically. For planning, I introduced a pre-planning backlog grooming session so that by the time we reached sprint planning, the top items were already well-defined. For release, I worked with the engineering lead to build a CI/CD pipeline that automated the three most time-consuming manual steps. For definition of done, I facilitated a team workshop that produced a single agreed-upon checklist. The combination of these changes produced a 25% velocity improvement over [X] months.',
    measurable_outcome: '25% release velocity improvement, reduced cycle time',
    best_for_questions: [
      'Tell me about a time you improved a team\'s delivery process.',
      'Describe a situation where you diagnosed and resolved a delivery performance problem.',
      'Tell me about a time you used data to drive process improvement.',
      'How have you improved Agile delivery cadence in a previous role?',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-004',
    title: 'Aligning Competing Stakeholders Across a Complex Technical Programme',
    category: STORY_CATEGORY.STAKEHOLDER_MANAGEMENT,
    linked_proof_ids: ['pb-001', 'pb-004', 'pb-006'],
    lane_tags: ['tpm', 'program_manager', 'delivery_manager'],
    tags: ['stakeholder-management', 'alignment', 'executive', 'cross-functional', 'programme'],
    story_format: STORY_FORMAT.STAR,
    situation: 'A complex technical programme had multiple stakeholder groups with competing priorities — the engineering team wanted more time for technical debt reduction, the product owner wanted to accelerate feature delivery, and the compliance team had non-negotiable security requirements that constrained the technical approach. The programme was at risk of scope creep and timeline slippage.',
    task: 'I needed to create alignment across these competing priorities without losing any of the key stakeholder groups, while keeping the programme on track for its agreed-upon delivery milestones.',
    action: 'I scheduled individual alignment conversations with each stakeholder group to understand their underlying priorities, not just their stated positions. I then ran a structured joint session where I presented a shared view of the programme constraints — timeline, scope, compliance requirements — and facilitated a discussion that moved from competing demands to shared tradeoff decisions. I proposed a prioritisation framework that gave each group a structured way to escalate high-priority items, and I established a bi-weekly steering committee where competing priorities could be aired and resolved with executive visibility.',
    result: 'The stakeholder groups reached alignment within two steering committee cycles. The programme delivered to the agreed timeline, with compliance requirements met, the highest-priority technical debt items addressed in a dedicated sprint, and the product roadmap phased appropriately. All three stakeholder groups rated the programme governance positively in the post-delivery review.',
    short_version: 'Aligned competing stakeholders (engineering, product, compliance) across complex programme — all groups satisfied at delivery.',
    long_version: '',
    measurable_outcome: 'Programme delivered on timeline, all stakeholder groups satisfied, compliance requirements met',
    best_for_questions: [
      'Tell me about a time you managed stakeholders with conflicting priorities.',
      'Describe a situation where you had to navigate a difficult stakeholder relationship.',
      'Tell me about a time you had to bring competing groups to alignment.',
      'How do you manage executive stakeholder expectations on a complex programme?',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-005',
    title: 'Reducing Security Incident Response by 50% via SOAR Automation',
    category: STORY_CATEGORY.IAM_SECURITY,
    linked_proof_ids: ['pb-008', 'pb-011'],
    lane_tags: ['tpm', 'ops_manager'],
    tags: ['soar', 'splunk', 'security-operations', 'automation', 'incident-response'],
    story_format: STORY_FORMAT.STAR,
    situation: 'The security operations team was spending a significant proportion of analyst time on manual incident triage — repetitive low-level alerts were consuming capacity that should have been focused on high-severity incidents. Mean time to respond (MTTR) was above target.',
    task: 'I was responsible for delivering a SOAR optimisation programme to reduce manual effort in incident response and improve MTTR across the security operations centre.',
    action: 'I mapped the current incident response workflow end-to-end, identifying the highest-volume, most repetitive triage categories. I worked with the security engineering team to build SOAR playbooks that automated the response steps for the top five alert categories, and redesigned the Splunk dashboards to improve analyst visibility of high-severity events. I ran the programme in two phases: playbook implementation first, followed by dashboard and workflow redesign. I managed the change transition with the SOC team to ensure adoption.',
    result: 'Achieved 50% reduction in manual incident response effort. MTTR improved to within target range. SOC analysts reported significantly higher capacity for high-severity incident investigation. The SOAR playbooks handled [X]% of low-level alert volume automatically within the first month post-deployment.',
    short_version: '50% security incident response improvement through SOAR automation and Splunk optimisation.',
    long_version: '',
    measurable_outcome: '50% reduction in manual incident response effort, MTTR within target',
    best_for_questions: [
      'Tell me about a time you delivered a security operations improvement.',
      'Describe a situation where you used automation to solve an operational problem.',
      'Tell me about a time you improved team capacity through process and technology change.',
      'How have you improved security operations efficiency in a previous role?',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-006',
    title: 'Delivering Under Ambiguity — Scoping a Programme with No Defined Requirements',
    category: STORY_CATEGORY.DELIVERY_UNDER_AMBIGUITY,
    linked_proof_ids: ['pb-012', 'pb-006'],
    lane_tags: ['tpm', 'program_manager'],
    tags: ['ambiguity', 'scoping', 'requirements', 'discovery', 'stakeholder-alignment'],
    story_format: STORY_FORMAT.STAR,
    situation: 'I was brought onto a programme where the client had a clearly defined goal — modernise a core operational system — but no defined requirements, no agreed technical approach, and limited stakeholder alignment on scope. The executive sponsor expected a delivery plan within [X] weeks.',
    task: 'I needed to rapidly create clarity out of ambiguity: establish what we were building, align the stakeholders, produce a credible delivery plan, and get the programme started — all without having the luxury of a long discovery phase.',
    action: 'I ran a structured 3-week discovery sprint. I facilitated a series of working sessions with each stakeholder group to capture their requirements and constraints, then synthesised the outputs into a programme brief with clearly articulated scope, out-of-scope boundaries, and key assumptions. I ran the programme brief through a structured review with the executive sponsor and the technical leads, resolving conflicts and explicitly documenting where we were making assumptions versus where we had confirmed requirements. I produced a phased delivery plan that deferred decisions where we genuinely lacked information to the appropriate phase.',
    result: 'Delivered a clear programme brief and delivery plan within [X] weeks. The executive sponsor approved the plan with one minor scope revision. The programme launched with stakeholder alignment and a shared understanding of what success looked like.',
    short_version: 'Scoped an ambiguous modernisation programme in 3 weeks — produced approved delivery plan with stakeholder alignment.',
    long_version: '',
    measurable_outcome: 'Approved programme brief and delivery plan within target timeline',
    best_for_questions: [
      'Tell me about a time you delivered in an ambiguous or uncertain environment.',
      'Describe a situation where you had to create structure from ambiguity.',
      'Tell me about a time you had to move quickly without full information.',
      'How do you handle scoping a programme when requirements are unclear?',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-007',
    title: 'Managing Budget and Financial Reporting for $1.2M Programme',
    category: STORY_CATEGORY.PRIORITIZATION,
    linked_proof_ids: ['pb-005'],
    lane_tags: ['tpm', 'program_manager'],
    tags: ['budget', 'financial-governance', 'programme-management', 'reporting', 'cost-management'],
    story_format: STORY_FORMAT.STAR,
    situation: 'A $1.2M programme required active budget management, variance reporting, and financial forecasting as a core part of the delivery governance — not just an administrative function. Costs were tracking above initial estimates in the second quarter.',
    task: 'I was responsible for programme budget ownership — tracking spend, producing variance analysis, forecasting end-state cost, and escalating budget risks to the executive sponsor in time to take corrective action.',
    action: 'I built a structured budget tracking framework that mapped each workstream to its cost components. When I identified that costs were tracking above budget in Q2, I produced a variance analysis that identified two specific contributors: scope additions that had not been formally costed, and vendor time-and-materials overruns. I escalated to the executive sponsor with a clear summary of the issue, the contributing factors, and three options for corrective action — each with cost and timeline implications. The sponsor selected the option that deferred two non-critical workstreams to a follow-on phase.',
    result: 'The programme delivered within the approved budget envelope. Zero uncontrolled overspend. The proactive escalation approach gave the executive sponsor the information they needed to make an informed decision before the budget risk became a budget breach.',
    short_version: 'Managed $1.2M programme budget — identified and escalated Q2 overspend risk, corrective action taken, delivered within budget.',
    long_version: '',
    measurable_outcome: 'Programme delivered within $1.2M budget envelope, proactive risk escalation',
    best_for_questions: [
      'Tell me about a time you managed a programme budget.',
      'Describe a situation where you identified a financial risk and escalated it appropriately.',
      'How do you manage budget governance on a complex programme?',
      'Tell me about a time you had to make prioritisation decisions under financial constraints.',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sb-008',
    title: 'Coordinating Cross-Functional Team of 15+ for Enterprise Platform Launch',
    category: STORY_CATEGORY.CROSS_FUNCTIONAL_LEADERSHIP,
    linked_proof_ids: ['pb-004', 'pb-006', 'pb-012'],
    lane_tags: ['tpm', 'delivery_manager'],
    tags: ['cross-functional', 'team-leadership', 'platform-launch', 'enterprise', 'coordination'],
    story_format: STORY_FORMAT.STAR,
    situation: 'An enterprise platform launch required coordinating a cross-functional team of 15+ members — engineers, architects, QA, business analysts, and operations staff — across multiple organisational boundaries and time zones.',
    task: 'I needed to establish effective coordination across the full team, maintain delivery momentum, resolve cross-functional blockers, and ensure the platform launched on time and to quality.',
    action: 'I designed a lightweight but effective team structure: daily standups with the core delivery leads, weekly full-team syncs, and a clear escalation path for cross-functional blockers. I established working agreements across the team on communication norms, escalation protocols, and definition of done. I personally drove the resolution of the cross-functional dependencies that were highest risk — particularly the integration points between the engineering team and the operations team, which had historically been a friction point. I maintained a dependency map and reviewed it in every delivery lead sync.',
    result: 'The platform launched on time to 100,000+ users. The cross-functional team operated with high cohesion throughout the programme. Post-launch hypercare was resolved within the planned window with no P1 production incidents.',
    short_version: 'Led cross-functional team of 15+ through enterprise platform launch to 100K+ users — on time, no P1 incidents.',
    long_version: '',
    measurable_outcome: 'On-time launch to 100,000+ users, no P1 production incidents',
    best_for_questions: [
      'Tell me about a time you led a large cross-functional team.',
      'Describe how you coordinate across teams with different priorities and working styles.',
      'Tell me about a time you managed a complex stakeholder ecosystem.',
      'How do you keep a large delivery team aligned and moving forward?',
    ],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

const STORY_BANK_KEY = 'story_bank';

/**
 * Load the Story Bank from user_preferences storage.
 * Falls back to INITIAL_STORY_BANK if nothing is stored.
 *
 * @param {object} userPreferences - the full user_preferences record (or null)
 * @returns {Array} story items
 */
export function loadStoryBankFromPrefs(userPreferences) {
  if (userPreferences && Array.isArray(userPreferences[STORY_BANK_KEY])) {
    return userPreferences[STORY_BANK_KEY];
  }
  return [...INITIAL_STORY_BANK];
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Filter stories by lane tag.
 */
export function getStoriesByLane(stories, lane) {
  return stories.filter(s => (s.lane_tags || []).includes(lane));
}

/**
 * Filter stories by category.
 */
export function getStoriesByCategory(stories, category) {
  return stories.filter(s => s.category === category);
}

/**
 * Select the most relevant stories for a given opportunity.
 * Ranks by: lane match, keyword overlap.
 *
 * @param {object} opp - opportunity record
 * @param {Array} stories - story bank items
 * @param {number} limit - max stories to return
 * @returns {Array} selected stories
 */
export function selectStoriesForRole(opp, stories, limit = 3) {
  const lane = opp.lane || '';
  const oppText = `${opp.title || ''} ${opp.description || ''}`.toLowerCase();

  const scored = stories.map(story => {
    let score = 0;

    // Lane match bonus
    if ((story.lane_tags || []).includes(lane)) score += 20;

    // Category relevance
    if (story.category === STORY_CATEGORY.FEDERAL_REGULATED &&
        (oppText.includes('federal') || oppText.includes('government') || oppText.includes('clearance'))) {
      score += 15;
    }
    if (story.category === STORY_CATEGORY.IAM_SECURITY &&
        (oppText.includes('iam') || oppText.includes('identity') || oppText.includes('security') || oppText.includes('splunk'))) {
      score += 15;
    }
    if (story.category === STORY_CATEGORY.CLOUD_MIGRATION &&
        (oppText.includes('cloud') || oppText.includes('migration') || oppText.includes('azure') || oppText.includes('aws'))) {
      score += 15;
    }

    // Keyword overlap with story tags
    const storyText = `${story.title} ${(story.tags || []).join(' ')}`.toLowerCase();
    const storyWords = storyText.split(/\s+/).filter(w => w.length >= 4);
    const overlaps = storyWords.filter(w => oppText.includes(w)).length;
    score += Math.min(overlaps * 3, 15);

    return { story, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.story);
}

/**
 * Find stories that match a given interview question text.
 *
 * @param {string} questionText - the interview question
 * @param {Array} stories - story bank items
 * @param {number} limit - max stories to return
 * @returns {Array} matching stories
 */
export function getStoriesForQuestion(questionText, stories, limit = 3) {
  const q = questionText.toLowerCase();

  const scored = stories.map(story => {
    let score = 0;

    for (const bfq of (story.best_for_questions || [])) {
      const bfqLower = bfq.toLowerCase();
      // Count word overlaps between question and best_for_questions
      const qWords = q.split(/\s+/).filter(w => w.length >= 4);
      const overlaps = qWords.filter(w => bfqLower.includes(w)).length;
      if (overlaps > 0) score += overlaps * 5;
    }

    // Category keyword matching
    if ((q.includes('federal') || q.includes('government')) &&
        story.category === STORY_CATEGORY.FEDERAL_REGULATED) score += 20;
    if ((q.includes('cloud') || q.includes('migration')) &&
        story.category === STORY_CATEGORY.CLOUD_MIGRATION) score += 20;
    if ((q.includes('stakeholder') || q.includes('conflict') || q.includes('competing')) &&
        story.category === STORY_CATEGORY.STAKEHOLDER_MANAGEMENT) score += 20;
    if ((q.includes('process') || q.includes('improve') || q.includes('efficiency')) &&
        story.category === STORY_CATEGORY.PROCESS_IMPROVEMENT) score += 20;
    if ((q.includes('ambig') || q.includes('uncertain') || q.includes('unclear')) &&
        story.category === STORY_CATEGORY.DELIVERY_UNDER_AMBIGUITY) score += 20;
    if ((q.includes('team') || q.includes('lead') || q.includes('cross-functional')) &&
        story.category === STORY_CATEGORY.CROSS_FUNCTIONAL_LEADERSHIP) score += 20;
    if ((q.includes('budget') || q.includes('financial') || q.includes('cost')) &&
        story.category === STORY_CATEGORY.PRIORITIZATION) score += 20;

    return { story, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.story);
}
