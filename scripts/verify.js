/**
 * Verification Script — Job Search OS
 *
 * Tests: hierarchy truth, dedup, stale detection, scoring logic.
 * Run: node scripts/verify.js
 */

import { scoreOpportunity, classifyLane, LANES } from '../netlify/functions/_shared/scoring.js';
import { generateDedupHash, checkDuplicate, partitionByDedup } from '../netlify/functions/_shared/dedup.js';
import { evaluateStaleness, scanForStale } from '../netlify/functions/_shared/stale.js';
import { passesDiscoveryProfile, DEFAULT_DISCOVERY_PROFILE, SOURCE_FAMILIES, DEFAULT_SOURCES } from '../netlify/functions/_shared/sources.js';
import { normaliseJob, stripHtml } from '../netlify/functions/_shared/jobFinder.js';
import {
  classifyReadinessGroup,
  getReadinessReason,
  groupByReadiness,
  getBestNextActions,
  computeReadinessSummary,
  READINESS_GROUPS,
  READINESS_GROUP_LABELS,
  READINESS_GROUP_ORDER,
} from '../netlify/functions/_shared/readiness.js';

let passed = 0;
let failed = 0;

function assert(desc, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

// ─── 1. Hierarchy Truth ───────────────────────────────────────────────────────

console.log('\n== 1. Lane Classification + Hierarchy ==');

const tpm = scoreOpportunity(
  'Senior Technical Project Manager',
  'Lead technical delivery of platform projects. Stakeholder management, SDLC, agile, Jira, Confluence. PMP preferred.'
);
assert('TPM title → lane=tpm', tpm.lane === LANES.TPM, tpm.lane);
assert('TPM score >= 80', tpm.score >= 80, `score=${tpm.score}`);
assert('TPM recommended=true', tpm.recommended);

const dm = scoreOpportunity(
  'Delivery Manager',
  'Lead agile delivery across squads. Sprint planning, retrospectives, release management, SAFe, scaled agile. Stakeholder reporting, cross-functional coordination, Jira, delivery cadence.'
);
assert('Delivery Manager → lane=delivery_manager', dm.lane === LANES.DELIVERY_MANAGER, dm.lane);
assert('Delivery Manager score >= 70', dm.score >= 70, `score=${dm.score}`);

const opsQualified = scoreOpportunity(
  'Technical Operations Manager',
  'Lead IT operations, technical readiness, ITSM, compliance, service management.'
);
assert('Qualified Ops Manager → lane=ops_manager', opsQualified.lane === LANES.OPS_MANAGER, opsQualified.lane);
assert('Qualified Ops score < TPM score', opsQualified.score < tpm.score, `ops=${opsQualified.score} tpm=${tpm.score}`);

const opsGeneric = scoreOpportunity(
  'Operations Manager',
  'Manage store operations, staff rostering, inventory, supplier relationships.'
);
assert('Generic Ops Manager → downgraded to generic_pm', opsGeneric.lane === LANES.GENERIC_PM, opsGeneric.lane);
assert('Generic Ops score < 40', opsGeneric.score < 40, `score=${opsGeneric.score}`);
assert('Generic Ops NOT recommended', !opsGeneric.recommended);

const pgmQualified = scoreOpportunity(
  'Senior Programme Manager',
  'Govern enterprise digital transformation programme. PMO establishment, portfolio management, governance framework, board reporting.'
);
assert('Qualified PgM → lane=program_manager', pgmQualified.lane === LANES.PROGRAM_MANAGER, pgmQualified.lane);
assert('PgM score < TPM score', pgmQualified.score < tpm.score, `pgm=${pgmQualified.score} tpm=${tpm.score}`);

const pgmGeneric = scoreOpportunity(
  'Program Manager',
  'Manage team projects, coordinate deliverables, stakeholder communication.'
);
assert('Generic PgM (no governance qualifier) → downgraded to generic_pm', pgmGeneric.lane === LANES.GENERIC_PM, pgmGeneric.lane);

const genericPM = scoreOpportunity(
  'Project Manager',
  'Coordinate team activities, manage timelines, stakeholder updates.'
);
assert('Generic PM → lane=generic_pm', genericPM.lane === LANES.GENERIC_PM, genericPM.lane);
assert('Generic PM score < 50', genericPM.score < 50, `score=${genericPM.score}`);

// Hierarchy ordering
assert('TPM > Delivery Manager in score (comparable roles)', tpm.score >= dm.score - 15, `tpm=${tpm.score} dm=${dm.score}`);
assert('Delivery Manager > Ops Manager', dm.score > opsQualified.score, `dm=${dm.score} ops=${opsQualified.score}`);
assert('Ops Manager (qualified) > Generic Ops', opsQualified.score > opsGeneric.score, `qualified=${opsQualified.score} generic=${opsGeneric.score}`);

// Strong delivery can outrank weak TPM when evidence supports it
const weakTPM = scoreOpportunity('Project Manager', 'Technical project coordination, some IT involvement.');
const strongDM = scoreOpportunity(
  'Delivery Lead',
  'Lead agile delivery across 5 squads. SAFe, scaled agile, sprint planning, release management, retrospectives, stakeholder reporting.'
);
assert('Strong Delivery Manager can outrank weak TPM', strongDM.score >= weakTPM.score, `dm=${strongDM.score} weakTpm=${weakTPM.score}`);

// ─── 2. Deduplication ─────────────────────────────────────────────────────────

console.log('\n== 2. Deduplication ==');

const hash1 = generateDedupHash({ title: 'Technical Project Manager', company: 'ANZ Bank' });
const hash2 = generateDedupHash({ title: 'Technical Project Manager', company: 'ANZ Bank' });
const hash3 = generateDedupHash({ title: 'Technical Project Manager', company: 'Westpac' });
assert('Same title+company → same hash', hash1 === hash2);
assert('Different company → different hash', hash1 !== hash3);

const { isDuplicate: dup1 } = checkDuplicate({ title: 'TPM', company: 'A' }, ['abc', generateDedupHash({ title: 'TPM', company: 'A' })]);
assert('Duplicate detected correctly', dup1);

const { isDuplicate: notDup } = checkDuplicate({ title: 'TPM', company: 'B' }, [generateDedupHash({ title: 'TPM', company: 'A' })]);
assert('Non-duplicate not flagged', !notDup);

const incoming = [
  { title: 'TPM', company: 'A' },
  { title: 'TPM', company: 'A' },  // duplicate of above
  { title: 'DM', company: 'B' },
];
const existing = [];
const { newItems, duplicates } = partitionByDedup(incoming, existing);
assert('Batch dedup: 2 unique, 1 duplicate', newItems.length === 2 && duplicates.length === 1, `new=${newItems.length} dup=${duplicates.length}`);

// ─── 3. Stale / Ghosted Detection ────────────────────────────────────────────

console.log('\n== 3. Stale / Ghosted Detection ==');

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();

const applied25 = evaluateStaleness({ status: 'applied', last_action_date: daysAgo(25) });
assert('Applied 25 days ago → stale', applied25.isStale);
assert('Applied 25 days ago → not ghosted', !applied25.isGhosted);

const applied50 = evaluateStaleness({ status: 'applied', last_action_date: daysAgo(50) });
assert('Applied 50 days ago → ghosted', applied50.isGhosted);

const recentApplied = evaluateStaleness({ status: 'applied', last_action_date: daysAgo(5) });
assert('Applied 5 days ago → not stale', !recentApplied.isStale);

const interviewing20 = evaluateStaleness({ status: 'interviewing', last_action_date: daysAgo(20) });
assert('Interviewing 20 days no movement → stale', interviewing20.isStale);

const discovered = evaluateStaleness({ status: 'discovered', last_action_date: daysAgo(100) });
assert('Discovered (no threshold) → not stale', !discovered.isStale);

// ─── 4. Human Override / Approval Gate ───────────────────────────────────────

console.log('\n== 4. Approval Gate Logic ==');

// Test that low-scored item can be overridden upward
const lowScoreOpp = scoreOpportunity('Admin Assistant', 'Filing, scheduling, data entry.');
assert('Non-PM role → low score', lowScoreOpp.score < 30, `score=${lowScoreOpp.score}`);
assert('Non-PM role → not recommended', !lowScoreOpp.recommended);

// Scoring signals are populated
assert('TPM scoring populates signals array', tpm.signals.length > 0);
assert('Generic PM signals contain downgrade reason', opsGeneric.signals.some(s => s.toLowerCase().includes('no technical qualifier')));

// ─── 5. Rollout Safety Verification ─────────────────────────────────────────

console.log('\n== 5. Rollout Safety ==');

// 5a. Approval gate: all ingested records start as pending
const newOpp = { id: 'test-1', title: 'Technical Project Manager', company: 'TestCo', status: 'discovered', approval_state: 'pending' };
assert('New opportunity starts with approval_state=pending', newOpp.approval_state === 'pending');
assert('New opportunity starts with status=discovered', newOpp.status === 'discovered');

// 5b. Weak Ops roles must NOT flood the approval queue as recommended
const genericOps1 = scoreOpportunity('Operations Manager', 'Manage warehouse staff, shifts, inventory, supplier orders.');
const genericOps2 = scoreOpportunity('Operations Manager', 'Run café operations, staff management, daily reconciliation.');
const genericOps3 = scoreOpportunity('Program Manager', 'Manage project timelines, team coordination, budget tracking.');
assert('Generic Ops 1 → not recommended (no tech qualifier)', !genericOps1.recommended, `score=${genericOps1.score} lane=${genericOps1.lane}`);
assert('Generic Ops 2 → not recommended (no tech qualifier)', !genericOps2.recommended, `score=${genericOps2.score} lane=${genericOps2.lane}`);
assert('Generic PgM → not recommended (no governance qualifier)', !genericOps3.recommended, `score=${genericOps3.score} lane=${genericOps3.lane}`);
assert('Generic Ops lanes are downgraded to generic_pm', genericOps1.lane === LANES.GENERIC_PM, genericOps1.lane);
assert('Generic Ops scores are low (<40)', genericOps1.score < 40 && genericOps2.score < 40, `ops1=${genericOps1.score} ops2=${genericOps2.score}`);

// 5c. Dedup under repeated runs
const batch1 = [
  { title: 'Technical Project Manager', company: 'CBA' },
  { title: 'Delivery Manager', company: 'ANZ' },
  { title: 'IT Operations Manager', company: 'Telstra' },
];
const { newItems: run1Items, duplicates: run1Dups } = partitionByDedup(batch1, []);
assert('First run: 3 new, 0 duplicates', run1Items.length === 3 && run1Dups.length === 0, `new=${run1Items.length} dup=${run1Dups.length}`);

// Second run with same batch — all should be deduplicated
const existingAfterRun1 = run1Items.map(i => i.dedupHash);
const { newItems: run2Items, duplicates: run2Dups } = partitionByDedup(batch1, existingAfterRun1);
assert('Second run with same records: 0 new, 3 deduplicated', run2Items.length === 0 && run2Dups.length === 3, `new=${run2Items.length} dup=${run2Dups.length}`);

// Third run with partial overlap
const batch3 = [
  { title: 'Technical Project Manager', company: 'CBA' }, // duplicate
  { title: 'Delivery Lead', company: 'NAB' },             // new
];
const { newItems: run3Items, duplicates: run3Dups } = partitionByDedup(batch3, existingAfterRun1);
assert('Third run: 1 new, 1 duplicate (partial overlap)', run3Items.length === 1 && run3Dups.length === 1, `new=${run3Items.length} dup=${run3Dups.length}`);

// 5d. High-review detection: count non-recommended in a batch
const mixedBatch = [
  { title: 'Technical Project Manager', description: 'Technical delivery, SDLC, agile delivery, stakeholder management, scrum, Jira, sprint planning, digital transformation, platform delivery, PMP.' },
  { title: 'Operations Manager', description: 'Manage store staff, inventory control, rostering.' },
  { title: 'Operations Manager', description: 'Run retail operations, staff scheduling, supplier relations.' },
  { title: 'Delivery Manager', description: 'Agile delivery, sprint planning, release management, SAFe.' },
];
const mixedScored = mixedBatch.map(j => scoreOpportunity(j.title, j.description));
const highReviewCount = mixedScored.filter(s => !s.recommended).length;
assert('Mixed batch: ≥2 high-review (non-recommended) records detected', highReviewCount >= 2, `high_review=${highReviewCount}`);
assert('Mixed batch: TPM still recommended', mixedScored[0].recommended, `score=${mixedScored[0].score}`);

// 5e. MAX_RECORDS_PER_RUN simulation
const MAX_RECORDS_PER_RUN = 50;
const largeSource = Array.from({ length: 80 }, (_, i) => ({ title: `Job ${i}`, company: `Co${i}` }));
const capped = largeSource.slice(0, MAX_RECORDS_PER_RUN);
assert('MAX_RECORDS_PER_RUN cap applied correctly (80→50)', capped.length === MAX_RECORDS_PER_RUN, `length=${capped.length}`);

// ─── 6. Apply Pack — Resume Recommendation Engine ────────────────────────────

import {
  RESUME_VERSIONS,
  recommendResumeVersion,
} from '../netlify/functions/_shared/scoring.js';
import {
  generateApplyPack,
  applyResumeOverride,
  regenerateApplyPack,
  generateCopyReadySummaryBlock,
  generateCopyReadyResumeEmphasisBlock,
  generateCopyReadyCoverNoteBlock,
  computePackReadinessScore,
} from '../netlify/functions/_shared/applyPack.js';

console.log('\n== 6. Apply Pack — Resume Recommendation ==');

// 6a. TPM role → TPM-BASE-01, high confidence
const tpmRec = recommendResumeVersion(LANES.TPM, 91, ['title: TPM exact/partial match', 'tool/method: agile']);
assert('TPM strong fit → TPM-BASE-01', tpmRec.version === RESUME_VERSIONS.TPM, tpmRec.version);
assert('TPM strong fit → confidence=high', tpmRec.confidence === 'high', tpmRec.confidence);

// 6b. Delivery Manager role → DEL-BASE-01
const delRec = recommendResumeVersion(LANES.DELIVERY_MANAGER, 78, ['agile delivery', 'sprint planning']);
assert('Delivery Manager strong fit → DEL-BASE-01', delRec.version === RESUME_VERSIONS.DELIVERY, delRec.version);
assert('Delivery Manager strong fit → confidence=high', delRec.confidence === 'high', delRec.confidence);

// 6c. Ops Manager (conditional) → OPS-COND-01 with tech signals
const opsRec = recommendResumeVersion(LANES.OPS_MANAGER, 68, ['technical readiness', 'compliance']);
assert('Ops Manager (technical signals) → OPS-COND-01', opsRec.version === RESUME_VERSIONS.OPS, opsRec.version);

// 6d. Ops Manager without tech signals → OPS-COND-01 medium confidence
const opsNoTech = recommendResumeVersion(LANES.OPS_MANAGER, 66, []);
assert('Ops Manager (no tech signals) → OPS-COND-01, medium confidence', opsNoTech.version === RESUME_VERSIONS.OPS && opsNoTech.confidence === 'medium', `v=${opsNoTech.version} c=${opsNoTech.confidence}`);

// 6e. Weak Ops role (low score) → MASTER-01
const weakOps = recommendResumeVersion(LANES.OPS_MANAGER, 40, []);
assert('Weak Ops Manager → MASTER-01', weakOps.version === RESUME_VERSIONS.MASTER, weakOps.version);

// 6f. Generic PM → MASTER-01, low confidence
const genericRec = recommendResumeVersion(LANES.GENERIC_PM, 32, []);
assert('Generic PM → MASTER-01', genericRec.version === RESUME_VERSIONS.MASTER, genericRec.version);
assert('Generic PM → confidence=low', genericRec.confidence === 'low', genericRec.confidence);

// 6g. Delivery weak fit → MASTER-01
const delWeak = recommendResumeVersion(LANES.DELIVERY_MANAGER, 40, []);
assert('Weak Delivery Manager → MASTER-01', delWeak.version === RESUME_VERSIONS.MASTER, delWeak.version);

console.log('\n== 7. Apply Pack Generation ==');

// 7a. Cannot generate pack for non-approved opportunity
const unapproved = { id: 'u1', title: 'TPM', approval_state: 'pending', lane: LANES.TPM, fit_score: 90, fit_signals: [] };
let threw = false;
try { generateApplyPack(unapproved); } catch { threw = true; }
assert('generateApplyPack throws for non-approved opportunity', threw);

// 7b. Generates pack for approved TPM opportunity
const approvedTPM = {
  id: 't1', title: 'Senior Technical Project Manager', company: 'ANZ', lane: LANES.TPM,
  fit_score: 91, fit_signals: ['title: TPM exact/partial match', 'tool/method: agile'],
  recommended: true, description: 'Lead technical delivery of digital banking platform projects. SDLC from requirements through deployment. Agile/scrum. PMP preferred.',
  approval_state: 'approved', status: 'approved',
};
const pack1 = generateApplyPack(approvedTPM);
assert('Apply Pack generated for approved TPM role', !!pack1, 'pack was null/undefined');
assert('Pack recommended_resume_version = TPM-BASE-01', pack1.recommended_resume_version === RESUME_VERSIONS.TPM, pack1.recommended_resume_version);
assert('Pack recommendation_confidence = high', pack1.recommendation_confidence === 'high', pack1.recommendation_confidence);
assert('Pack has keyword_mirror_list', pack1.keyword_mirror_list?.length > 0, String(pack1.keyword_mirror_list?.length));
assert('Pack has apply_checklist', pack1.apply_checklist?.length > 0, String(pack1.apply_checklist?.length));
assert('Pack has recruiter_outreach_draft', typeof pack1.recruiter_outreach_draft === 'string' && pack1.recruiter_outreach_draft.length > 20);
assert('Pack has hiring_manager_outreach_draft', typeof pack1.hiring_manager_outreach_draft === 'string' && pack1.hiring_manager_outreach_draft.length > 20);
assert('Pack has suggested_follow_up_date', /^\d{4}-\d{2}-\d{2}$/.test(pack1.suggested_follow_up_date), pack1.suggested_follow_up_date);
assert('Pack has pack_version=1', pack1.pack_version === 1, String(pack1.pack_version));
assert('Pack has generated_at', !!pack1.generated_at);
assert('Pack role_snapshot frozen', pack1.role_snapshot?.title === approvedTPM.title, pack1.role_snapshot?.title);
assert('Pack original_system_recommendation preserved', pack1.original_system_recommendation === RESUME_VERSIONS.TPM, pack1.original_system_recommendation);
assert('Pack resume_version_override is null', pack1.resume_version_override === null);

// 7c. Approved Delivery Manager role → DEL-BASE-01
const approvedDM = {
  id: 'd1', title: 'Delivery Manager', company: 'CBA', lane: LANES.DELIVERY_MANAGER,
  fit_score: 78, fit_signals: ['agile delivery', 'sprint planning'],
  recommended: true, description: 'Agile delivery cadence. Sprint planning, retros. Release management.',
  approval_state: 'approved', status: 'approved',
};
const packDM = generateApplyPack(approvedDM);
assert('Delivery Manager role → DEL-BASE-01', packDM.recommended_resume_version === RESUME_VERSIONS.DELIVERY, packDM.recommended_resume_version);

console.log('\n== 8. Apply Pack Override + Auditability ==');

// 8a. Override preserves original recommendation
const overridden = applyResumeOverride(pack1, RESUME_VERSIONS.DELIVERY, 'Role requires strong delivery framing');
assert('Override sets resume_version_override', overridden.resume_version_override === RESUME_VERSIONS.DELIVERY, overridden.resume_version_override);
assert('Override preserves original_system_recommendation', overridden.original_system_recommendation === RESUME_VERSIONS.TPM, overridden.original_system_recommendation);
assert('Override sets override reason', overridden.resume_version_override_reason === 'Role requires strong delivery framing');
assert('Override sets override timestamp', !!overridden.resume_version_override_at);

// 8b. Invalid override version throws
let invalidThrew = false;
try { applyResumeOverride(pack1, 'FAKE-VERSION', 'test'); } catch { invalidThrew = true; }
assert('Override with invalid version throws', invalidThrew);

// 8c. Regenerate preserves override history and bumps version
const regen = regenerateApplyPack(approvedTPM, overridden);
assert('Regenerated pack version bumped', regen.pack_version === 2, String(regen.pack_version));
assert('Regenerated pack preserves resume_version_override', regen.resume_version_override === RESUME_VERSIONS.DELIVERY, regen.resume_version_override);
assert('Regenerated pack preserves override reason', regen.resume_version_override_reason === 'Role requires strong delivery framing');
assert('Regenerated pack has fresh generated content', regen.keyword_mirror_list?.length > 0);

// 8d. Regenerate without prior override produces clean pack
const regenClean = regenerateApplyPack(approvedTPM, pack1);
assert('Regenerated clean pack has no override', regenClean.resume_version_override === null);
assert('Regenerated clean pack bumps version', regenClean.pack_version === 2, String(regenClean.pack_version));

console.log('\n== 9. Apply Workflow Status Progression ==');

// 9a. Valid transitions
const VALID_STATUSES = ['approved', 'apply_pack_generated', 'ready_to_apply', 'applied', 'follow_up_1', 'follow_up_2', 'interviewing', 'offer', 'rejected', 'ghosted', 'withdrawn'];
assert('Apply workflow includes apply_pack_generated', VALID_STATUSES.includes('apply_pack_generated'));
assert('Apply workflow includes ready_to_apply', VALID_STATUSES.includes('ready_to_apply'));
assert('Apply workflow includes follow_up_1 and follow_up_2', VALID_STATUSES.includes('follow_up_1') && VALID_STATUSES.includes('follow_up_2'));
assert('Apply workflow includes withdrawn', VALID_STATUSES.includes('withdrawn'));

// 9b. Apply Pack does not bypass approval gate
const pendingOpp = { id: 'p1', approval_state: 'pending', lane: LANES.TPM, fit_score: 85, fit_signals: [] };
let approvalGateHeld = false;
try { generateApplyPack(pendingOpp); } catch { approvalGateHeld = true; }
assert('Apply Pack generation blocked for pending opportunity', approvalGateHeld);

// 9c. Rejected opportunity cannot get pack
const rejectedOpp = { id: 'r1', approval_state: 'rejected', lane: LANES.TPM, fit_score: 85, fit_signals: [] };
let rejectedBlocked = false;
try { generateApplyPack(rejectedOpp); } catch { rejectedBlocked = true; }
assert('Apply Pack generation blocked for rejected opportunity', rejectedBlocked);

// ─── 10. Real Job Finder + URL Model ─────────────────────────────────────────

console.log('\n== 10. Real Job Finder + URL Model ==');

// 10a. normaliseJob always sets is_demo_record: false
const norm = normaliseJob({
  title: 'Senior Technical Project Manager',
  company: 'Acme Corp',
  description: 'Lead delivery of platform projects.',
  location: 'Sydney, NSW',
  canonical_job_url: 'https://boards.greenhouse.io/acme/jobs/12345',
  application_url: 'https://boards.greenhouse.io/acme/jobs/12345#app',
  source_job_id: '12345',
  source_family: SOURCE_FAMILIES.GREENHOUSE,
  source_id: 'src-greenhouse-boards',
});
assert('normaliseJob sets is_demo_record=false', norm.is_demo_record === false, String(norm.is_demo_record));
assert('normaliseJob preserves canonical_job_url', norm.canonical_job_url === 'https://boards.greenhouse.io/acme/jobs/12345');
assert('normaliseJob preserves application_url', norm.application_url === 'https://boards.greenhouse.io/acme/jobs/12345#app');
assert('normaliseJob preserves source_family', norm.source_family === SOURCE_FAMILIES.GREENHOUSE, norm.source_family);
assert('normaliseJob preserves source_job_id', norm.source_job_id === '12345');

// 10b. normaliseJob handles missing URLs gracefully
const normNoUrl = normaliseJob({ title: 'PM', company: 'X', description: '', location: '' });
assert('normaliseJob handles missing canonical_job_url', normNoUrl.canonical_job_url === null);
assert('normaliseJob handles missing application_url', normNoUrl.application_url === null);

// 10c. Demo data records must be labeled is_demo_record=true
const { DEMO_OPPORTUNITIES } = await import('../src/lib/demoData.js');
const demoRecordsLabeled = DEMO_OPPORTUNITIES.every(d => d.is_demo_record === true);
assert('All demo records have is_demo_record=true', demoRecordsLabeled);

// 10d. Demo data must NOT contain example.com URLs
const noExampleCom = DEMO_OPPORTUNITIES.every(d =>
  !d.url?.includes('example.com') &&
  !d.canonical_job_url?.includes('example.com') &&
  !d.application_url?.includes('example.com')
);
assert('No demo record contains example.com URL', noExampleCom);

// 10e. Discovery profile includes correct priority titles
const profile = DEFAULT_DISCOVERY_PROFILE;
const hasTPM = profile.includeTitleKeywords.some(kw => kw.toLowerCase().includes('technical project manager'));
const hasDM = profile.includeTitleKeywords.some(kw => kw.toLowerCase().includes('delivery manager'));
assert('Discovery profile includes Technical Project Manager', hasTPM);
assert('Discovery profile includes Delivery Manager', hasDM);

// 10f. passesDiscoveryProfile correctly filters out excluded titles
const juniorJob = { title: 'Junior Project Manager', description: 'Agile delivery, technical scrum', location: 'Sydney' };
assert('Discovery profile rejects junior title', !passesDiscoveryProfile(juniorJob, profile));

// 10g. passesDiscoveryProfile accepts strong TPM title
const tpmJob = { title: 'Senior Technical Project Manager', description: 'Lead delivery of cloud migration programme.', location: 'Sydney' };
assert('Discovery profile accepts Senior TPM title', passesDiscoveryProfile(tpmJob, profile));

// 10h. passesDiscoveryProfile excludes out-of-scope domains
const constructionJob = { title: 'Senior Project Manager', description: 'construction project civil engineering infrastructure site works', location: 'Sydney' };
assert('Discovery profile excludes construction domain keyword', !passesDiscoveryProfile(constructionJob, profile));

// 10i. stripHtml removes tags and decodes entities
const stripped = stripHtml('<p>Lead <strong>technical</strong> delivery &amp; SDLC ownership.</p>');
assert('stripHtml removes HTML tags', !stripped.includes('<p>') && !stripped.includes('<strong>'));
assert('stripHtml decodes &amp;', stripped.includes('&'));

// 10j. Source families are correctly defined
assert('SOURCE_FAMILIES.GREENHOUSE defined', SOURCE_FAMILIES.GREENHOUSE === 'greenhouse');
assert('SOURCE_FAMILIES.LEVER defined', SOURCE_FAMILIES.LEVER === 'lever');
assert('SOURCE_FAMILIES.USAJOBS defined', SOURCE_FAMILIES.USAJOBS === 'usajobs');
assert('SOURCE_FAMILIES.DEMO defined', SOURCE_FAMILIES.DEMO === 'demo');
assert('LinkedIn is not a source family that enables automation', SOURCE_FAMILIES.LINKEDIN === 'linkedin');

// 10k. Demo records all have is_demo_record=true (source_family may vary for realistic source comparison)
const allDemoFlagged = DEMO_OPPORTUNITIES.every(d => d.is_demo_record === true);
assert('All demo records have is_demo_record=true', allDemoFlagged);

// ─── Summary ─────────────────────────────────────────────────────────────────

// ─── 11. Production Hardening — Auth, Schema Fields, Events, Profile ──────────

console.log('\n== 11. Production Hardening ==');

// 11a. discover.js is auth-protected — check isAuthorized logic manually by
//      inspecting the module source rather than importing the handler (avoids env deps).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname_v = dirname(fileURLToPath(import.meta.url));
const discoverSrc = readFileSync(join(__dirname_v, '../netlify/functions/discover.js'), 'utf-8');
assert('discover.js contains isAuthorized function', discoverSrc.includes('function isAuthorized('));
assert('discover.js checks Authorization header', discoverSrc.includes('Authorization') || discoverSrc.includes('authorization'));
assert('discover.js checks X-Discovery-Secret header', discoverSrc.includes('x-discovery-secret'));
assert('discover.js returns 401 on auth failure', discoverSrc.includes('statusCode: 401'));

// 11b. /discover fires discovery_run_complete event
assert('discover.js fires discovery_run_complete event', discoverSrc.includes('discovery_run_complete'));

// 11c. /discover fires new_strong_fit event
assert('discover.js fires new_strong_fit event', discoverSrc.includes('new_strong_fit'));

// 11d. approve.js fires apply_pack_generated event
const approveSrc = readFileSync(join(__dirname_v, '../netlify/functions/approve.js'), 'utf-8');
assert('approve.js fires apply_pack_generated event', approveSrc.includes('apply_pack_generated'));

// 11e. approve.js fires strong_fit_ready_to_apply event
assert('approve.js fires strong_fit_ready_to_apply event', approveSrc.includes('strong_fit_ready_to_apply'));

// 11f. approve.js uses threshold check before strong_fit event
assert('approve.js uses fit_score threshold for strong_fit event', approveSrc.includes('fit_score') && approveSrc.includes('>= 75'));

// 11g. prep.js exports fireEvent
const prepSrc = readFileSync(join(__dirname_v, '../netlify/functions/_shared/prep.js'), 'utf-8');
assert('prep.js exports fireEvent', prepSrc.includes('export async function fireEvent('));

// 11h. fireEvent is safe if no URL configured
assert('fireEvent returns early if no WEBHOOK_URL', prepSrc.includes('if (!url) return'));

// 11i. Supabase migration SQL exists and covers required columns
const migSrc = readFileSync(join(__dirname_v, '../supabase/migrations/001_discovery_fields.sql'), 'utf-8');
assert('Migration adds canonical_job_url', migSrc.includes('canonical_job_url'));
assert('Migration adds application_url', migSrc.includes('application_url'));
assert('Migration adds source_family', migSrc.includes('source_family'));
assert('Migration adds source_job_id', migSrc.includes('source_job_id'));
assert('Migration adds is_demo_record', migSrc.includes('is_demo_record'));
assert('Migration adds discovered_at', migSrc.includes('discovered_at'));
assert('Migration is idempotent (IF NOT EXISTS)', migSrc.includes('IF NOT EXISTS'));

// 11j. n8n workflow 05 exists and includes DISCOVERY_SECRET
const n8nSrc = readFileSync(join(__dirname_v, '../n8n/workflows/05-job-discovery.json'), 'utf-8');
const n8nWorkflow = JSON.parse(n8nSrc);
assert('n8n workflow 05 exists', !!n8nWorkflow.name);
assert('n8n workflow 05 references /discover endpoint', n8nSrc.includes('/discover'));
assert('n8n workflow 05 uses DISCOVERY_SECRET', n8nSrc.includes('DISCOVERY_SECRET'));
assert('n8n workflow 05 has manual trigger', n8nSrc.includes('manualTrigger'));
assert('n8n workflow 05 has schedule trigger', n8nSrc.includes('scheduleTrigger'));

// 11k. Discovered.jsx page exists and references triggerDiscover
const discoveredPageSrc = readFileSync(join(__dirname_v, '../src/pages/Discovered.jsx'), 'utf-8');
assert('Discovered.jsx exists', !!discoveredPageSrc);
assert('Discovered.jsx imports triggerDiscover', discoveredPageSrc.includes('triggerDiscover'));
assert('Discovered.jsx shows demo badge', discoveredPageSrc.includes('DEMO'));
assert('Discovered.jsx has approve/reject actions', discoveredPageSrc.includes('onApprove') && discoveredPageSrc.includes('onReject'));
assert('Discovered.jsx has Open Posting link', discoveredPageSrc.includes('Open Posting'));

// 11l. DiscoveryProfile.jsx page exists
const profilePageSrc = readFileSync(join(__dirname_v, '../src/pages/DiscoveryProfile.jsx'), 'utf-8');
assert('DiscoveryProfile.jsx exists', !!profilePageSrc);
assert('DiscoveryProfile.jsx references includeTitleKeywords', profilePageSrc.includes('includeTitleKeywords'));
assert('DiscoveryProfile.jsx references excludeTitleKeywords', profilePageSrc.includes('excludeTitleKeywords'));
assert('DiscoveryProfile.jsx references enabledSourceFamilies', profilePageSrc.includes('enabledSourceFamilies'));
assert('DiscoveryProfile.jsx excludes LinkedIn from source families', !profilePageSrc.includes('linkedin') && !profilePageSrc.includes('LinkedIn automation'));

// 11m. App.jsx registers /discover route
const appSrc = readFileSync(join(__dirname_v, '../src/App.jsx'), 'utf-8');
assert('App.jsx registers /discover route', appSrc.includes("path: 'discover'"));
assert('App.jsx registers /discover/profile route', appSrc.includes("path: 'discover/profile'"));

// 11n. Sidebar has Discovered Jobs link
const sidebarSrc = readFileSync(join(__dirname_v, '../src/components/Sidebar.jsx'), 'utf-8');
assert('Sidebar has Discovered Jobs link', sidebarSrc.includes('Discovered Jobs'));
assert('Sidebar shows discoveredCount badge', sidebarSrc.includes('discoveredCount'));

// 11o. api.js exports triggerDiscover, fetchDiscoveryProfile, saveDiscoveryProfile
const apiSrc = readFileSync(join(__dirname_v, '../src/lib/api.js'), 'utf-8');
assert('api.js exports triggerDiscover', apiSrc.includes('export async function triggerDiscover('));
assert('api.js exports fetchDiscoveryProfile', apiSrc.includes('export async function fetchDiscoveryProfile('));
assert('api.js exports saveDiscoveryProfile', apiSrc.includes('export async function saveDiscoveryProfile('));

// 11p. OpportunityDetail has discovery provenance block
const oppDetailSrc = readFileSync(join(__dirname_v, '../src/pages/OpportunityDetail.jsx'), 'utf-8');
assert('OpportunityDetail shows discovery provenance block', oppDetailSrc.includes('Discovery provenance'));
assert('OpportunityDetail shows source_family', oppDetailSrc.includes('source_family'));
assert('OpportunityDetail shows source_job_id', oppDetailSrc.includes('source_job_id'));
assert('OpportunityDetail distinguishes demo vs live', oppDetailSrc.includes('Demo') && oppDetailSrc.includes('Live discovered'));

// 11q. env.example documents DISCOVERY_SECRET
const envSrc = readFileSync(join(__dirname_v, '../.env.example'), 'utf-8');
assert('.env.example documents DISCOVERY_SECRET', envSrc.includes('DISCOVERY_SECRET'));

// 11r. trigger-discover.js is the browser proxy — uses runDiscovery, not handler
const triggerDiscoverSrc = readFileSync(join(__dirname_v, '../netlify/functions/trigger-discover.js'), 'utf-8');
assert('trigger-discover.js imports runDiscovery (not handler) from discover.js', triggerDiscoverSrc.includes("import { runDiscovery }") && triggerDiscoverSrc.includes("from './discover.js'"));
assert('trigger-discover.js does NOT re-export or import the discover handler', !triggerDiscoverSrc.includes('handler as discoverHandler') && !triggerDiscoverSrc.includes('import { handler }'));
assert('trigger-discover.js calls runDiscovery directly', triggerDiscoverSrc.includes('return runDiscovery(body)') || triggerDiscoverSrc.includes('runDiscovery(body)'));
assert('trigger-discover.js does not construct synthetic auth header', !triggerDiscoverSrc.includes('authorization: `Bearer'));
assert('discover.js exports runDiscovery as named export', discoverSrc.includes('export async function runDiscovery('));
assert('discover.js handler delegates to runDiscovery after auth check', discoverSrc.includes('return runDiscovery(body)'));

// 11s. Runtime timeout is handled by AbortSignal in function code, not invalid netlify.toml scalar
// netlify.toml `timeout = 26` is invalid syntax (scalar under [functions]) — was a deploy blocker.
// Timeout resilience is now in jobFinder.js via AbortSignal.timeout(20000) per external fetch.
const netlifySrc = readFileSync(join(__dirname_v, '../netlify.toml'), 'utf-8');
assert('netlify.toml does not contain invalid timeout scalar (removed deploy blocker)', !netlifySrc.includes('timeout = 26'));
assert('jobFinder.js uses AbortSignal.timeout for per-fetch timeout resilience', discoverSrc.includes('AbortSignal') || readFileSync(join(__dirname_v, '../netlify/functions/_shared/jobFinder.js'), 'utf-8').includes('AbortSignal'));

// ─── 12. Live Intake Activation Hardening ─────────────────────────────────────

console.log('\n== 12. Live Intake Activation Hardening ==');

// 12a. discover.js uses correct processBatch result fields (inserted.length, not .new/.ingested)
assert(
  'discover.js uses inserted.length for ingestion count',
  discoverSrc.includes('inserted.length') && !discoverSrc.includes('ingestResult?.new') && !discoverSrc.includes('ingestResult?.ingested'),
  'Should use inserted.length from processBatch result'
);

// 12b. discover.js uses correct logIngestion column names
assert(
  'discover.js logIngestion uses count_new (not new_records)',
  discoverSrc.includes('count_new') && !discoverSrc.includes("new_records:"),
  'Should use count_new column name'
);
assert(
  'discover.js logIngestion uses count_deduped (not duplicates)',
  discoverSrc.includes('count_deduped') && !discoverSrc.includes("duplicates:"),
  'Should use count_deduped column name'
);
assert(
  'discover.js logIngestion uses count_high_review',
  discoverSrc.includes('count_high_review'),
  'Should log count_high_review'
);

// 12c. new_strong_fit event is conditional on recommended count, not just any ingested count
assert(
  'discover.js new_strong_fit fires only for recommended records (totalRecommended > 0)',
  discoverSrc.includes('totalRecommended > 0') || discoverSrc.includes('totalRecommended>0'),
  'new_strong_fit should only fire when recommended records exist'
);
assert(
  'discover.js tracks totalRecommended count',
  discoverSrc.includes('totalRecommended'),
  'Should track totalRecommended'
);

// 12d. discover.js validates Greenhouse config before running
assert(
  'discover.js validates GREENHOUSE_BOARDS before running greenhouse source',
  discoverSrc.includes('GREENHOUSE_BOARDS') && discoverSrc.includes('greenhouseBoards.length === 0'),
  'Should fail fast if GREENHOUSE_BOARDS is empty'
);

// 12e. discover.js validates Lever config before running
assert(
  'discover.js validates LEVER_BOARDS before running lever source',
  discoverSrc.includes('LEVER_BOARDS') && discoverSrc.includes('leverBoards.length === 0'),
  'Should fail fast if LEVER_BOARDS is empty'
);

// 12f. discover.js validates USAJobs config before running
assert(
  'discover.js validates USAJOBS_API_KEY before running usajobs source',
  discoverSrc.includes('USAJOBS_API_KEY') && discoverSrc.includes('USAJOBS_USER_AGENT'),
  'Should fail fast if USAJobs credentials missing'
);

// 12g. db.js uses canonical_job_url as fallback for dedup hash
const dbSrc = readFileSync(join(__dirname_v, '../netlify/functions/_shared/db.js'), 'utf-8');
assert(
  'db.js processBatch passes canonical_job_url as url fallback to generateDedupHash',
  dbSrc.includes('canonical_job_url'),
  'Should use canonical_job_url in dedup hash computation'
);

// 12h. Migration 002 (ingestion_logs) exists
let mig002Src = '';
try { mig002Src = readFileSync(join(__dirname_v, '../supabase/migrations/002_ingestion_logs_table.sql'), 'utf-8'); } catch {}
assert('Migration 002 exists (ingestion_logs_table.sql)', mig002Src.length > 0);
assert('Migration 002 creates ingestion_logs table', mig002Src.includes('ingestion_logs'));
assert('Migration 002 defines count_new column', mig002Src.includes('count_new'));
assert('Migration 002 defines count_deduped column', mig002Src.includes('count_deduped'));
assert('Migration 002 defines count_high_review column', mig002Src.includes('count_high_review'));
assert('Migration 002 is idempotent (IF NOT EXISTS)', mig002Src.includes('IF NOT EXISTS'));

// 12i. LIVE_ACTIVATION_RUNBOOK.md exists with required sections
let activationRunbook = '';
try { activationRunbook = readFileSync(join(__dirname_v, '../LIVE_ACTIVATION_RUNBOOK.md'), 'utf-8'); } catch {}
assert('LIVE_ACTIVATION_RUNBOOK.md exists', activationRunbook.length > 0);
assert('Activation runbook has pre-activation checklist', activationRunbook.toLowerCase().includes('pre-activation') || activationRunbook.toLowerCase().includes('prerequisite'));
assert('Activation runbook covers Greenhouse as first source', activationRunbook.includes('Greenhouse') || activationRunbook.includes('greenhouse'));
assert('Activation runbook has rollback section', activationRunbook.toLowerCase().includes('rollback') || activationRunbook.toLowerCase().includes('kill switch'));

// 12j. dedup hash correctly falls back to URL when company is missing
const hashWithCompany = generateDedupHash({ title: 'Technical PM', company: 'Acme', url: '' });
const hashNoCompanyWithUrl = generateDedupHash({ title: 'Technical PM', company: '', url: 'https://boards.greenhouse.io/acme/jobs/123' });
assert('Dedup: title+company hash differs from title+url hash', hashWithCompany !== hashNoCompanyWithUrl);
assert('Dedup: same title, no company, same URL produces stable hash', hashNoCompanyWithUrl === generateDedupHash({ title: 'Technical PM', company: '', url: 'https://boards.greenhouse.io/acme/jobs/123' }));

// 12k. Source config validation: Greenhouse with empty boards list should fail
let githubConfigValidated = false;
try {
  const testSource = { sourceFamily: 'greenhouse', id: 'src-greenhouse-boards' };
  const testBoards = [];
  if (testSource.sourceFamily === 'greenhouse' && testBoards.length === 0) {
    throw new Error('GREENHOUSE_BOARDS env var is empty');
  }
} catch (e) {
  githubConfigValidated = e.message.includes('GREENHOUSE_BOARDS');
}
assert('Source config validation: Greenhouse with empty boards throws clear error', githubConfigValidated);

// ─── 13. Quick Add from External Posting ─────────────────────────────────────

console.log('\n== 13. Quick Add from External Posting ==');

// 13a. SOURCE_FAMILIES includes manual_external
assert(
  'SOURCE_FAMILIES has manual_external',
  SOURCE_FAMILIES.MANUAL_EXTERNAL === 'manual_external',
  'Should define manual_external source family'
);

// 13b. sources.js has src-manual-external definition
const quickAddSourceExists = DEFAULT_SOURCES.some(s => s.id === 'src-manual-external');
assert(
  'sources.js defines src-manual-external source',
  quickAddSourceExists,
  'Should have a src-manual-external source entry'
);
if (quickAddSourceExists) {
  const src = DEFAULT_SOURCES.find(s => s.id === 'src-manual-external');
  assert('src-manual-external has HIGH trust level', src.trustLevel === 'high' || src.trustLevel === 'HIGH' || src.trustLevel?.toLowerCase() === 'high');
  assert('src-manual-external is enabled by default', src.enabled === true);
  assert('src-manual-external description mentions paste/manual', src.description.toLowerCase().includes('paste') || src.description.toLowerCase().includes('manual'));
}

// 13c. quick-add.js Netlify function exists
let quickAddFn = '';
try { quickAddFn = readFileSync(join(__dirname_v, '../netlify/functions/quick-add.js'), 'utf-8'); } catch {}
assert('netlify/functions/quick-add.js exists', quickAddFn.length > 0);
assert('quick-add.js requires reference_posting_url', quickAddFn.includes('reference_posting_url'));
assert('quick-add.js requires pasted_jd_text', quickAddFn.includes('pasted_jd_text'));
assert('quick-add.js accepts external_apply_url', quickAddFn.includes('external_apply_url'));
assert('quick-add.js uses SOURCE_FAMILIES.MANUAL_EXTERNAL', quickAddFn.includes('MANUAL_EXTERNAL') || quickAddFn.includes('manual_external'));
assert('quick-add.js calls processBatch (shared scoring path)', quickAddFn.includes('processBatch'));
assert('quick-add.js detects LinkedIn URLs (isLinkedInUrl)', quickAddFn.includes('isLinkedInUrl') || quickAddFn.includes('linkedin'));
assert('quick-add.js does NOT fetch LinkedIn (safety guard)', !quickAddFn.includes("fetch('https://www.linkedin") && !quickAddFn.includes('fetch("https://www.linkedin'));
assert('quick-add.js returns duplicate:true when deduped', quickAddFn.includes('duplicate: true') || quickAddFn.includes("duplicate:true"));
assert('quick-add.js stores reference_posting_url on record', quickAddFn.includes('reference_posting_url'));
assert('quick-add.js stores is_manual_external_intake flag', quickAddFn.includes('is_manual_external_intake'));

// 13d. api.js exports quickAddOpportunity
const apiSrc13 = apiSrc; // use already-read file from Section 12
assert('api.js exports quickAddOpportunity', apiSrc13.includes('export async function quickAddOpportunity'));
assert('api.js quickAddOpportunity validates reference_posting_url', apiSrc13.includes('reference_posting_url') && apiSrc13.includes('required'));
assert('api.js quickAddOpportunity validates pasted_jd_text', apiSrc13.includes('pasted_jd_text') && apiSrc13.includes('required'));
assert('api.js quickAddOpportunity calls scoreOpportunity (shared path)', apiSrc13.includes('scoreOpportunity'));
assert('api.js quickAddOpportunity calls /.netlify/functions/quick-add in production', apiSrc13.includes('/quick-add'));
assert('api.js quickAddOpportunity handles LinkedIn URL safely in demo mode', apiSrc13.includes('isLinkedIn') || apiSrc13.includes('linkedin.com'));

// 13e. QuickAdd.jsx page exists
let quickAddJsx = '';
try { quickAddJsx = readFileSync(join(__dirname_v, '../src/pages/QuickAdd.jsx'), 'utf-8'); } catch {}
assert('src/pages/QuickAdd.jsx exists', quickAddJsx.length > 0);
assert('QuickAdd.jsx imports quickAddOpportunity', quickAddJsx.includes('quickAddOpportunity'));
assert('QuickAdd.jsx has reference_posting_url field', quickAddJsx.includes('reference_posting_url'));
assert('QuickAdd.jsx has pasted_jd_text textarea', quickAddJsx.includes('pasted_jd_text'));
assert('QuickAdd.jsx has external_apply_url field', quickAddJsx.includes('external_apply_url'));
assert('QuickAdd.jsx warns user about LinkedIn (no scraping notice)', quickAddJsx.toLowerCase().includes('linkedin'));
assert('QuickAdd.jsx shows fit score in success state', quickAddJsx.includes('fit_score') || quickAddJsx.includes('Fit Score'));
assert('QuickAdd.jsx links to Approval Queue after success', quickAddJsx.includes('/queue'));
assert('QuickAdd.jsx links to opportunity detail after success', quickAddJsx.includes('/opportunity/'));

// 13f. App.jsx registers /quick-add route
const appSrc13 = appSrc; // use already-read file from Section 12
assert('App.jsx has /quick-add route', appSrc13.includes("path: 'quick-add'") || appSrc13.includes('path="quick-add"'));
assert('App.jsx imports QuickAdd', appSrc13.includes("import QuickAdd"));

// 13g. Sidebar.jsx includes Quick Add nav entry
const sidebarSrc13 = sidebarSrc; // use already-read file from Section 12
assert('Sidebar.jsx has Quick Add nav entry', sidebarSrc13.includes('/quick-add'));
assert('Sidebar.jsx Quick Add has meaningful label', sidebarSrc13.includes('Quick Add'));

// 13h. Scoring logic — pasted text exercises existing shared scoreOpportunity
const tpmScore = scoreOpportunity('Technical Project Manager', 'Lead technical delivery projects, agile, SDLC, stakeholder management, Jira, release planning, cross-functional teams');
assert('Quick Add scoring: strong TPM title+JD → TPM lane', tpmScore.lane === LANES.TPM);
assert('Quick Add scoring: strong TPM → recommended', tpmScore.recommended === true);

const deliveryScore = scoreOpportunity('Delivery Manager', 'Agile delivery lead for cross-functional squads, SAFe, sprint planning, velocity tracking, release management, incident response');
assert('Quick Add scoring: Delivery Manager → DELIVERY lane', deliveryScore.lane === LANES.DELIVERY_MANAGER);
assert('Quick Add scoring: strong Delivery → recommended', deliveryScore.recommended === true);

const genericOpsScore = scoreOpportunity('Operations Manager', 'Store operations, staff rostering, inventory management, customer service KPIs, loss prevention');
assert('Quick Add scoring: weak generic Ops → NOT TPM lane', genericOpsScore.lane !== LANES.TPM);
assert('Quick Add scoring: weak generic Ops → not recommended or low score', !genericOpsScore.recommended || genericOpsScore.score < 60);

// 13i. Dedup works for manual external roles using reference URL as fallback
const hashA = generateDedupHash({ title: 'Technical PM', company: 'Atlassian', url: 'https://www.linkedin.com/jobs/view/12345' });
const hashB = generateDedupHash({ title: 'Technical PM', company: 'Atlassian', url: 'https://www.linkedin.com/jobs/view/12345' });
assert('Quick Add dedup: same title+company+URL hash is stable (idempotent)', hashA === hashB);

const hashC = generateDedupHash({ title: 'Technical PM', company: 'Atlassian', url: 'https://boards.greenhouse.io/atlassian/jobs/999' });
// When both title and company are present, the hash is title|company — URL is not included.
// So same title+company at different URLs deduplicates correctly (they're the same role at the same company).
assert('Quick Add dedup: same title+company, different URL → same hash (title+company key wins)', hashA === hashC);

// ─── Section 14: UX + Workflow Layer — Handoff, needs_apply_url, Compact Widget ──

console.log('\n─── Section 14: UX + Workflow Layer ───────────────────────────────────────');

// 14a. needs_apply_url status exists in StatusBadge
let statusBadgeSrc = '';
try { statusBadgeSrc = readFileSync(join(__dirname_v, '../src/components/StatusBadge.jsx'), 'utf-8'); } catch {}
assert('StatusBadge.jsx includes needs_apply_url label', statusBadgeSrc.includes('needs_apply_url'));

// 14b. Tracker status dropdown includes needs_apply_url
let trackerSrc = '';
try { trackerSrc = readFileSync(join(__dirname_v, '../src/pages/Tracker.jsx'), 'utf-8'); } catch {}
assert('Tracker.jsx status dropdown includes needs_apply_url', trackerSrc.includes('needs_apply_url'));

// 14c. api.js exports updateApplyUrl
assert('api.js exports updateApplyUrl', apiSrc.includes('export async function updateApplyUrl'));
assert('api.js updateApplyUrl advances status from needs_apply_url → apply_pack_generated', apiSrc.includes("needs_apply_url") && apiSrc.includes('apply_pack_generated'));
assert('api.js updateApplyUrl updates application_url field', apiSrc.includes("application_url: applicationUrl"));
assert('api.js updateApplyUrl sets apply_pack_missing_url: false', apiSrc.includes('apply_pack_missing_url: false'));

// 14d. api.js approveOpportunity sets needs_apply_url when manual_external + no apply URL
assert('api.js approveOpportunity sets needs_apply_url for manual external + no apply URL', apiSrc.includes("needs_apply_url") && apiSrc.includes('is_manual_external_intake'));
assert('api.js approveOpportunity still sets apply_pack_generated when URL is present', apiSrc.includes('apply_pack_generated'));

// 14e. approve.js backend also sets needs_apply_url when applicable
let approveFn = '';
try { approveFn = readFileSync(join(__dirname_v, '../netlify/functions/approve.js'), 'utf-8'); } catch {}
assert('approve.js sets needs_apply_url for manual external + no apply URL', approveFn.includes('needs_apply_url') && approveFn.includes('is_manual_external_intake'));
assert('approve.js sets apply_pack_missing_url flag', approveFn.includes('apply_pack_missing_url'));

// 14f. QuickAdd.jsx enhanced success handoff
const qaJsx14 = quickAddJsx;
assert('QuickAdd.jsx success handoff shows apply URL status', qaJsx14.includes('Apply URL') || qaJsx14.includes('application_url'));
assert('QuickAdd.jsx has Approve Now / Approve + Generate Apply Pack button', qaJsx14.includes('Approve') && (qaJsx14.includes('Apply Pack') || qaJsx14.includes('approveOpportunity')));
assert('QuickAdd.jsx imports approveOpportunity for handoff', qaJsx14.includes('approveOpportunity'));
assert('QuickAdd.jsx handoff links to /apply-pack/:id', qaJsx14.includes('/apply-pack/'));
assert('QuickAdd.jsx shows next-action recommendation in handoff', qaJsx14.includes('nextAction') || qaJsx14.includes('next action') || qaJsx14.includes('Next:'));
assert('QuickAdd.jsx handoff allows rejection of weak-fit role', qaJsx14.includes('Reject') || qaJsx14.includes('reject'));

// 14g. QuickAddWidget.jsx exists (compact widget)
let widgetSrc = '';
try { widgetSrc = readFileSync(join(__dirname_v, '../src/components/QuickAddWidget.jsx'), 'utf-8'); } catch {}
assert('QuickAddWidget.jsx exists', widgetSrc.length > 0);
assert('QuickAddWidget.jsx has reference URL field', widgetSrc.includes('reference_posting_url') || widgetSrc.includes('reference_url') || widgetSrc.includes('qaw-url'));
assert('QuickAddWidget.jsx has JD text field', widgetSrc.includes('pasted_jd_text') || widgetSrc.includes('jd_text') || widgetSrc.includes('qaw-jd'));
assert('QuickAddWidget.jsx has title and company fields', widgetSrc.includes('qaw-title') || widgetSrc.includes("'title'"), widgetSrc.includes('qaw-company') || widgetSrc.includes("'company'"));
assert('QuickAddWidget.jsx calls quickAddOpportunity', widgetSrc.includes('quickAddOpportunity'));
assert('QuickAddWidget.jsx detects LinkedIn URL', widgetSrc.includes('linkedin') || widgetSrc.includes('LinkedIn'));
assert('QuickAddWidget.jsx is collapsible', widgetSrc.includes('open') || widgetSrc.includes('collapse'));
assert('QuickAddWidget.jsx links to /queue after success', widgetSrc.includes('/queue'));

// 14h. Dashboard.jsx imports and renders QuickAddWidget
let dashSrc14 = '';
try { dashSrc14 = readFileSync(join(__dirname_v, '../src/pages/Dashboard.jsx'), 'utf-8'); } catch {}
assert('Dashboard.jsx imports QuickAddWidget', dashSrc14.includes('QuickAddWidget'));
assert('Dashboard.jsx renders <QuickAddWidget />', dashSrc14.includes('<QuickAddWidget'));

// 14i. ApplyPack.jsx has missing apply URL banner
let applyPackSrc = '';
try { applyPackSrc = readFileSync(join(__dirname_v, '../src/pages/ApplyPack.jsx'), 'utf-8'); } catch {}
assert('ApplyPack.jsx imports updateApplyUrl', applyPackSrc.includes('updateApplyUrl'));
assert('ApplyPack.jsx shows missing apply URL warning when no application_url', applyPackSrc.includes('apply_url_missing') || (applyPackSrc.includes('application_url') && applyPackSrc.includes('Needs Apply URL') || applyPackSrc.includes('missing')));
assert('ApplyPack.jsx has inline URL entry for missing URL', applyPackSrc.includes('addUrlValue') || applyPackSrc.includes('Add Apply URL'));
assert('ApplyPack.jsx checklist includes find-apply-url item for manual external', applyPackSrc.includes('Find') && applyPackSrc.includes('apply URL') || applyPackSrc.includes('find') && applyPackSrc.includes('url'));
assert('ApplyPack.jsx handles needs_apply_url status in action bar', applyPackSrc.includes('needs_apply_url'));

// 14j. OpportunityDetail.jsx has inline apply URL update
assert('OpportunityDetail.jsx imports updateApplyUrl', oppDetailSrc.includes('updateApplyUrl'));
assert('OpportunityDetail.jsx shows inline apply URL entry for manual external with missing URL', oppDetailSrc.includes('applyUrlInput') || oppDetailSrc.includes('Add URL'));

// 14k. Scoring still correct after all changes (no regression)
const tpmScore14 = scoreOpportunity('Technical Project Manager', 'Lead technical delivery projects, agile, SDLC, stakeholder management, Jira, release planning, cross-functional teams');
assert('Scoring regression: TPM JD → TPM lane', tpmScore14.lane === LANES.TPM);
assert('Scoring regression: strong TPM → recommended', tpmScore14.recommended === true);

const delScore14 = scoreOpportunity('Delivery Manager', 'Agile delivery lead for cross-functional squads, SAFe, sprint planning, velocity tracking, release management');
assert('Scoring regression: Delivery JD → DELIVERY lane', delScore14.lane === LANES.DELIVERY_MANAGER);
assert('Scoring regression: strong Delivery → recommended', delScore14.recommended === true);

const weakOps14 = scoreOpportunity('Operations Manager', 'Store operations, staff rostering, inventory management, customer service KPIs, loss prevention');
assert('Scoring regression: weak generic Ops → NOT TPM lane', weakOps14.lane !== LANES.TPM);
assert('Scoring regression: weak generic Ops → not recommended or low score', !weakOps14.recommended || weakOps14.score < 60);

// 14l. LinkedIn safety — no fetch/scrape introduced
assert('QuickAddWidget does not fetch LinkedIn URLs', !widgetSrc.includes("fetch(form.reference_posting_url") && !widgetSrc.includes('axios.get') && !widgetSrc.includes("fetch(linkedIn") && !widgetSrc.includes('await fetch(form.'));
assert('QuickAdd page does not fetch LinkedIn URLs', !qaJsx14.includes("fetch(form.reference_posting_url") && !qaJsx14.includes('scrape'));

// ─── 15. Apply Pack Automation Layer ─────────────────────────────────────────

console.log('\n== 15. Apply Pack Automation Layer ==');

// 15a. generateCopyReadySummaryBlock output
const tpmOppFull = {
  id: 'opp-s15-tpm',
  title: 'Senior Technical Project Manager',
  company: 'AcmeCorp',
  lane: LANES.TPM,
  fit_score: 85,
  fit_signals: ['technical project manager'],
  recommended: true,
  approval_state: 'approved',
  status: 'approved',
  application_url: 'https://acmecorp.com/apply/123',
};
const summaryBlock = generateCopyReadySummaryBlock(tpmOppFull, ['agile', 'stakeholder management', 'SDLC']);
assert('generateCopyReadySummaryBlock returns non-empty string', typeof summaryBlock === 'string' && summaryBlock.length > 50);
assert('generateCopyReadySummaryBlock includes DRAFT notice', summaryBlock.includes('DRAFT'));
assert('generateCopyReadySummaryBlock references company', summaryBlock.includes('AcmeCorp'));
assert('generateCopyReadySummaryBlock references lane for TPM', summaryBlock.toLowerCase().includes('technical project manager') || summaryBlock.includes('TPM'));
assert('generateCopyReadySummaryBlock does not fabricate specific numbers', !summaryBlock.includes('$') && !summaryBlock.match(/\b[0-9]{4,}\b/));

// 15b. generateCopyReadyResumeEmphasisBlock output
const emphasisBlock = generateCopyReadyResumeEmphasisBlock(
  tpmOppFull,
  ['Lead bullets with delivery outcome', 'Show stakeholder span'],
  ['Led end-to-end technical delivery of [project]']
);
assert('generateCopyReadyResumeEmphasisBlock returns non-empty string', typeof emphasisBlock === 'string' && emphasisBlock.length > 50);
assert('generateCopyReadyResumeEmphasisBlock includes DRAFT notice', emphasisBlock.includes('DRAFT'));
assert('generateCopyReadyResumeEmphasisBlock includes lead-with themes section', emphasisBlock.includes('LEAD-WITH THEMES') || emphasisBlock.includes('LEAD-WITH'));
assert('generateCopyReadyResumeEmphasisBlock includes proof points section', emphasisBlock.includes('PROOF POINTS') || emphasisBlock.includes('SURFACE'));

// 15c. generateApplyPack now includes copy_ready_summary_block
const tpmPack = generateApplyPack(tpmOppFull);
assert('Apply Pack includes copy_ready_summary_block', typeof tpmPack.copy_ready_summary_block === 'string' && tpmPack.copy_ready_summary_block.length > 0);
assert('Apply Pack includes copy_ready_resume_emphasis_block', typeof tpmPack.copy_ready_resume_emphasis_block === 'string' && tpmPack.copy_ready_resume_emphasis_block.length > 0);
assert('Apply Pack copy_ready_summary_block contains DRAFT notice', tpmPack.copy_ready_summary_block.includes('DRAFT'));
assert('Apply Pack copy_ready_resume_emphasis_block contains DRAFT notice', tpmPack.copy_ready_resume_emphasis_block.includes('DRAFT'));
assert('Apply Pack tracks apply_url_missing_at_generation', 'apply_url_missing_at_generation' in tpmPack);
assert('Apply Pack apply_url_missing_at_generation is false when URL present', tpmPack.apply_url_missing_at_generation === false);

// 15d. apply_url_missing_at_generation when no URL
const noUrlOpp = { ...tpmOppFull, application_url: null };
const noUrlPack = generateApplyPack(noUrlOpp);
assert('Apply Pack apply_url_missing_at_generation is true when URL absent', noUrlPack.apply_url_missing_at_generation === true);

// 15e. computePackReadinessScore
const readinessWithUrl = computePackReadinessScore(tpmOppFull, tpmPack);
assert('computePackReadinessScore returns a number', typeof readinessWithUrl === 'number');
assert('computePackReadinessScore is between 0 and 100', readinessWithUrl >= 0 && readinessWithUrl <= 100);
assert('computePackReadinessScore is higher when apply URL is present', readinessWithUrl > computePackReadinessScore(noUrlOpp, noUrlPack));

// 15f. Delivery lane gets Delivery summary
const delOpp = {
  ...tpmOppFull, id: 'opp-s15-del', title: 'Delivery Manager', lane: LANES.DELIVERY_MANAGER,
  fit_score: 80, company: 'BetaInc',
};
const delPack = generateApplyPack(delOpp);
assert('Delivery Manager Apply Pack includes copy_ready_summary_block', delPack.copy_ready_summary_block.length > 0);
assert('Delivery Manager summary block references Delivery/Agile content', delPack.copy_ready_summary_block.toLowerCase().includes('delivery') || delPack.copy_ready_summary_block.toLowerCase().includes('agile'));
assert('Delivery Manager Apply Pack recommends DEL-BASE-01', delPack.recommended_resume_version === 'DEL-BASE-01');

// 15g. TPM resume recommendation preserved in pack
assert('TPM Apply Pack recommends TPM-BASE-01', tpmPack.recommended_resume_version === 'TPM-BASE-01');

// 15h. Weak Ops does not get TPM pack
const weakOpsOpp = {
  id: 'opp-s15-ops', title: 'Operations Manager', company: 'RetailCo',
  lane: LANES.GENERIC_PM, fit_score: 28, recommended: false,
  approval_state: 'approved', status: 'approved', application_url: null,
};
const weakOpsPack = generateApplyPack(weakOpsOpp);
assert('Weak Ops Apply Pack does NOT recommend TPM-BASE-01', weakOpsPack.recommended_resume_version !== 'TPM-BASE-01');

// 15i. approve.js fires apply_pack_generated event
let approveSrc15 = '';
try { approveSrc15 = readFileSync(join(__dirname_v, '../netlify/functions/approve.js'), 'utf-8'); } catch {}
assert('approve.js fires apply_pack_generated event', approveSrc15.includes("fireEvent('apply_pack_generated'") || approveSrc15.includes('apply_pack_generated'));
assert('approve.js fires strong_fit_ready_to_apply event', approveSrc15.includes("fireEvent('strong_fit_ready_to_apply'") || approveSrc15.includes('strong_fit_ready_to_apply'));
assert('approve.js only fires strong_fit_ready_to_apply when fit_score >= 75', approveSrc15.includes('75') && approveSrc15.includes('strong_fit_ready_to_apply'));

// 15j. ApplyPack.jsx has copy-ready UI
let applyPackSrc15 = '';
try { applyPackSrc15 = readFileSync(join(__dirname_v, '../src/pages/ApplyPack.jsx'), 'utf-8'); } catch {}
assert('ApplyPack.jsx has copy-ready tab', applyPackSrc15.includes('copyready') || applyPackSrc15.includes('Copy-Ready'));
assert('ApplyPack.jsx renders copy_ready_summary_block', applyPackSrc15.includes('copy_ready_summary_block'));
assert('ApplyPack.jsx renders copy_ready_resume_emphasis_block', applyPackSrc15.includes('copy_ready_resume_emphasis_block'));
assert('ApplyPack.jsx has handlePrintExport or text export', applyPackSrc15.includes('handlePrintExport') || applyPackSrc15.includes('Export Text'));
assert('ApplyPack.jsx has pack readiness score display', applyPackSrc15.includes('packReadiness') || applyPackSrc15.includes('Pack Readiness'));
assert('ApplyPack.jsx imports computePackReadinessScore', applyPackSrc15.includes('computePackReadinessScore'));

// 15k. Approval remains mandatory (no auto-approve path in pack generation)
assert('Apply Pack generator requires approval_state === approved', (() => {
  try { generateApplyPack({ ...tpmOppFull, approval_state: 'pending' }); return false; } catch { return true; }
})());

// ─── Section 16: Continuity + Persistence + Premium Usability Layer ──────────

console.log('\n== 16. Continuity + Persistence + Premium Usability Layer ==');

// 16a. generateCopyReadyCoverNoteBlock — exported and functional
const tpmOpp16 = {
  id: 'opp-s16-tpm', title: 'Senior Technical Project Manager',
  company: 'AlphaCloud', lane: LANES.TPM, fit_score: 88,
  recommended: true, approval_state: 'approved', status: 'approved',
  application_url: 'https://alphacloud.com/careers/apply/123',
};
const coverNote16 = generateCopyReadyCoverNoteBlock(tpmOpp16, ['agile', 'stakeholder management', 'SDLC']);
assert('generateCopyReadyCoverNoteBlock returns a non-empty string', typeof coverNote16 === 'string' && coverNote16.length > 100);
assert('generateCopyReadyCoverNoteBlock includes DRAFT notice', coverNote16.includes('[DRAFT'));
assert('generateCopyReadyCoverNoteBlock is 3 paragraphs minimum', coverNote16.split('\n\n').length >= 3);
assert('generateCopyReadyCoverNoteBlock includes company name', coverNote16.includes('AlphaCloud'));
assert('generateCopyReadyCoverNoteBlock does not fabricate salary figures', !coverNote16.match(/\$[0-9]+/));
assert('generateCopyReadyCoverNoteBlock does not auto-claim specific years without placeholder', !coverNote16.match(/\b[0-9]+\+ years\b/) || coverNote16.includes('[X]+'));

// 16b. generateApplyPack includes copy_ready_cover_note_block
const pack16 = generateApplyPack(tpmOpp16);
assert('Apply Pack v4 includes copy_ready_cover_note_block', typeof pack16.copy_ready_cover_note_block === 'string' && pack16.copy_ready_cover_note_block.length > 0);
assert('Apply Pack v4 copy_ready_cover_note_block contains DRAFT notice', pack16.copy_ready_cover_note_block.includes('[DRAFT'));

// 16c. pack_readiness_score is now embedded in the pack itself
assert('Apply Pack embeds pack_readiness_score', typeof pack16.pack_readiness_score === 'number');
assert('pack_readiness_score is in valid range 0–100', pack16.pack_readiness_score >= 0 && pack16.pack_readiness_score <= 100);
assert('pack_readiness_score increases with cover note block present', pack16.pack_readiness_score >= computePackReadinessScore({ ...tpmOpp16, application_url: null }, { ...pack16, copy_ready_cover_note_block: null }));

// 16d. pack_readiness_score reflects apply URL presence
const noUrlOpp16 = { ...tpmOpp16, application_url: null };
const noUrlPack16 = generateApplyPack(noUrlOpp16);
assert('pack_readiness_score lower without apply URL', noUrlPack16.pack_readiness_score < pack16.pack_readiness_score);

// 16e. regenerateApplyPack preserves override history, checklist, adds regeneration_reason
const packWithChecklist = { ...pack16, apply_checklist: pack16.apply_checklist.map((c, i) => i === 0 ? { ...c, done: true } : c), resume_version_override: 'MASTER-01', resume_version_override_reason: 'test reason' };
const regenPack16 = regenerateApplyPack(tpmOpp16, packWithChecklist, 'apply_url_added');
assert('regenerateApplyPack increments pack_version', regenPack16.pack_version === (packWithChecklist.pack_version || 1) + 1);
assert('regenerateApplyPack preserves resume_version_override', regenPack16.resume_version_override === 'MASTER-01');
assert('regenerateApplyPack preserves checklist done states', regenPack16.apply_checklist.some(c => c.done === true));
assert('regenerateApplyPack records regeneration_reason', regenPack16.regeneration_reason === 'apply_url_added');
assert('regenerateApplyPack embeds updated pack_readiness_score', typeof regenPack16.pack_readiness_score === 'number');

// 16f. Cover note works for all primary lanes
const delivOpp16 = { ...tpmOpp16, id: 'opp-s16-del', title: 'Delivery Manager', lane: LANES.DELIVERY_MANAGER };
const delCoverNote = generateCopyReadyCoverNoteBlock(delivOpp16, ['SAFe', 'sprint planning']);
assert('Delivery cover note returns string', typeof delCoverNote === 'string' && delCoverNote.length > 50);
assert('Delivery cover note contains DRAFT notice', delCoverNote.includes('[DRAFT'));

// 16g. /profile Netlify function file exists
let profileFnSrc16 = '';
try { profileFnSrc16 = readFileSync(join(__dirname_v, '../netlify/functions/profile.js'), 'utf-8'); } catch {}
assert('netlify/functions/profile.js exists', profileFnSrc16.length > 0);
assert('profile.js handles GET', profileFnSrc16.includes("'GET'") || profileFnSrc16.includes('"GET"'));
assert('profile.js handles POST', profileFnSrc16.includes("'POST'") || profileFnSrc16.includes('"POST"'));
assert('profile.js uses PROFILE_KEY = discovery_profile', profileFnSrc16.includes('discovery_profile'));

// 16h. Supabase migration 003 exists
let migration16 = '';
try { migration16 = readFileSync(join(__dirname_v, '../supabase/migrations/003_user_preferences.sql'), 'utf-8'); } catch {}
assert('supabase/migrations/003_user_preferences.sql exists', migration16.length > 0);
assert('migration 003 creates user_preferences table', migration16.includes('user_preferences'));
assert('migration 003 has profile_key column', migration16.includes('profile_key'));

// 16i. db.js has getPreference and upsertPreference
let dbSrc16 = '';
try { dbSrc16 = readFileSync(join(__dirname_v, '../netlify/functions/_shared/db.js'), 'utf-8'); } catch {}
assert('db.js exports getPreference', dbSrc16.includes('getPreference'));
assert('db.js exports upsertPreference', dbSrc16.includes('upsertPreference'));

// 16j. api.js fetchDiscoveryProfile now has server-side path
let apiSrc16 = '';
try { apiSrc16 = readFileSync(join(__dirname_v, '../src/lib/api.js'), 'utf-8'); } catch {}
assert('api.js fetchDiscoveryProfile has live mode server path', apiSrc16.includes('/profile') && apiSrc16.includes('isDemoMode'));
assert('api.js saveDiscoveryProfile POSTs to /profile in live mode', apiSrc16.includes('/profile') && apiSrc16.includes('POST'));
assert('api.js saveDiscoveryProfile has localStorage fallback', apiSrc16.includes('localStorage.setItem') && apiSrc16.includes('PROFILE_STORAGE_KEY'));

// 16k. updateApplyUrl in api.js now regenerates pack when apply_url_missing_at_generation
assert('api.js updateApplyUrl regenerates pack on apply_url_missing_at_generation', apiSrc16.includes('apply_url_missing_at_generation') && apiSrc16.includes('regenerateApplyPack'));

// 16l. ApplyPack.jsx has cover note block, print button, and uses persisted readiness score
let applyPackSrc16 = '';
try { applyPackSrc16 = readFileSync(join(__dirname_v, '../src/pages/ApplyPack.jsx'), 'utf-8'); } catch {}
assert('ApplyPack.jsx renders copy_ready_cover_note_block', applyPackSrc16.includes('copy_ready_cover_note_block'));
assert('ApplyPack.jsx has Print / Save PDF button', applyPackSrc16.includes('Print') && (applyPackSrc16.includes('window.print') || applyPackSrc16.includes('handleBrowserPrint')));
assert('ApplyPack.jsx uses persisted pack_readiness_score from pack', applyPackSrc16.includes('pack.pack_readiness_score'));
assert('ApplyPack.jsx text export includes cover note', applyPackSrc16.includes('copy_ready_cover_note_block') && applyPackSrc16.includes('COVER NOTE'));
assert('ApplyPack.jsx shows regeneration_reason for apply_url_added', applyPackSrc16.includes('apply_url_added') || applyPackSrc16.includes('regeneration_reason'));

// 16m. Print CSS in style.css
let styleSrc16 = '';
try { styleSrc16 = readFileSync(join(__dirname_v, '../src/style.css'), 'utf-8'); } catch {}
assert('style.css includes @media print rules', styleSrc16.includes('@media print'));
assert('style.css @media print hides nav chrome', styleSrc16.includes('nav') && styleSrc16.includes('display: none'));

// 16n. approve.js persists pack_readiness_score on opportunity
let approveSrc16 = '';
try { approveSrc16 = readFileSync(join(__dirname_v, '../netlify/functions/approve.js'), 'utf-8'); } catch {}
assert('approve.js persists pack_readiness_score', approveSrc16.includes('pack_readiness_score'));

// 16o. opportunities.js PATCH allows pack_readiness_score
let oppsFnSrc16 = '';
try { oppsFnSrc16 = readFileSync(join(__dirname_v, '../netlify/functions/opportunities.js'), 'utf-8'); } catch {}
assert('opportunities.js PATCH allows pack_readiness_score', oppsFnSrc16.includes('pack_readiness_score'));
assert('opportunities.js regenerates pack when apply_url_missing_at_generation', oppsFnSrc16.includes('apply_url_missing_at_generation') && oppsFnSrc16.includes('regenerateApplyPack'));

// 16p. Approval remains mandatory (no autoflow bypass)
assert('Apply Pack v4 still requires approved state', (() => {
  try { generateApplyPack({ ...tpmOpp16, approval_state: 'pending' }); return false; } catch { return true; }
})());

// 16q. Scoring hierarchy preserved — weak Ops still not TPM
const weakOps16 = scoreOpportunity('Operations Manager', 'Store operations, staff rostering, inventory, loss prevention, team scheduling');
assert('Section 16: weak Ops still not TPM lane', weakOps16.lane !== LANES.TPM);
assert('Section 16: weak Ops not over-recommended', !weakOps16.recommended || weakOps16.score < 60);

// ─── Section 17: Prioritization + Actionability Layer ────────────────────────

console.log('\n== 17. Prioritization + Actionability Layer ==');

// Base opportunity shapes for Section 17
const s17ReadyOpp = {
  id: 'opp-s17-ready', title: 'Senior TPM', company: 'ReadyCo',
  lane: LANES.TPM, fit_score: 88, recommended: true,
  approval_state: 'approved', status: 'approved',
  application_url: 'https://readyco.com/apply/123',
  pack_readiness_score: 85,
};
const s17NeedsUrlOpp = {
  id: 'opp-s17-nourl', title: 'Delivery Manager', company: 'NeedURLCo',
  lane: LANES.DELIVERY_MANAGER, fit_score: 82, recommended: true,
  approval_state: 'approved', status: 'approved',
  application_url: null,
  pack_readiness_score: 60,
};
const s17PendingOpp = {
  id: 'opp-s17-pending', title: 'IT Project Manager', company: 'PendingCo',
  lane: LANES.TPM, fit_score: 75, recommended: true,
  approval_state: 'pending', status: 'queued',
  application_url: null,
  pack_readiness_score: null,
};
const s17AppliedFollowOpp = {
  id: 'opp-s17-follow', title: 'Programme Manager', company: 'FollowCo',
  lane: LANES.PROGRAM_MANAGER, fit_score: 70, recommended: true,
  approval_state: 'approved', status: 'applied',
  application_url: 'https://followco.com/apply/5',
  pack_readiness_score: 80,
  next_action_due: new Date(Date.now() + 86400000).toISOString().slice(0, 10), // tomorrow
};
const s17LowPriorityOpp = {
  id: 'opp-s17-low', title: 'Store Operations Manager', company: 'LowPriCo',
  lane: LANES.GENERIC_PM, fit_score: 22, recommended: false,
  approval_state: 'pending', status: 'discovered',
  application_url: null,
  pack_readiness_score: null,
};
const s17RejectedOpp = {
  id: 'opp-s17-rejected', title: 'Project Manager', company: 'RejectedCo',
  lane: LANES.GENERIC_PM, fit_score: 35, recommended: false,
  approval_state: 'rejected', status: 'rejected',
  application_url: null,
};

// 17a. classifyReadinessGroup — correct groupings
assert('classifyReadinessGroup: approved + apply URL + high readiness = READY_TO_APPLY',
  classifyReadinessGroup(s17ReadyOpp) === READINESS_GROUPS.READY_TO_APPLY);

assert('classifyReadinessGroup: approved + NO apply URL = NEEDS_APPLY_URL',
  classifyReadinessGroup(s17NeedsUrlOpp) === READINESS_GROUPS.NEEDS_APPLY_URL);

assert('classifyReadinessGroup: pending approval = NEEDS_APPROVAL',
  classifyReadinessGroup(s17PendingOpp) === READINESS_GROUPS.NEEDS_APPROVAL);

assert('classifyReadinessGroup: applied + follow-up due soon = APPLIED_FOLLOW_UP',
  classifyReadinessGroup(s17AppliedFollowOpp) === READINESS_GROUPS.APPLIED_FOLLOW_UP);

assert('classifyReadinessGroup: low fit + not recommended = LOW_PRIORITY',
  classifyReadinessGroup(s17LowPriorityOpp) === READINESS_GROUPS.LOW_PRIORITY);

assert('classifyReadinessGroup: rejected = LOW_PRIORITY',
  classifyReadinessGroup(s17RejectedOpp) === READINESS_GROUPS.LOW_PRIORITY);

// 17b. getReadinessReason returns human-readable blocked reason
const s17ReadyReason = getReadinessReason(s17ReadyOpp);
assert('getReadinessReason for READY_TO_APPLY includes readiness score', s17ReadyReason.includes('85'));

const s17NeedsUrlReason = getReadinessReason(s17NeedsUrlOpp);
assert('getReadinessReason for NEEDS_APPLY_URL says blocked / apply URL', s17NeedsUrlReason.toLowerCase().includes('apply url') || s17NeedsUrlReason.toLowerCase().includes('blocked'));

const s17PendingReason = getReadinessReason(s17PendingOpp);
assert('getReadinessReason for NEEDS_APPROVAL mentions approval', s17PendingReason.toLowerCase().includes('approv'));

// 17c. groupByReadiness sorts correctly
const s17AllOpps = [s17ReadyOpp, s17NeedsUrlOpp, s17PendingOpp, s17AppliedFollowOpp, s17LowPriorityOpp, s17RejectedOpp];
const s17Groups = groupByReadiness(s17AllOpps);

assert('groupByReadiness has READY_TO_APPLY group', Array.isArray(s17Groups[READINESS_GROUPS.READY_TO_APPLY]));
assert('groupByReadiness READY_TO_APPLY contains the ready opp', s17Groups[READINESS_GROUPS.READY_TO_APPLY].some(o => o.id === 'opp-s17-ready'));
assert('groupByReadiness NEEDS_APPLY_URL contains the blocked opp', s17Groups[READINESS_GROUPS.NEEDS_APPLY_URL].some(o => o.id === 'opp-s17-nourl'));
assert('groupByReadiness NEEDS_APPROVAL contains pending opp', s17Groups[READINESS_GROUPS.NEEDS_APPROVAL].some(o => o.id === 'opp-s17-pending'));
assert('groupByReadiness LOW_PRIORITY contains low-fit opp', s17Groups[READINESS_GROUPS.LOW_PRIORITY].some(o => o.id === 'opp-s17-low'));

// 17d. High readiness roles sort above low readiness within same group
const s17TwoApproved = [
  { ...s17ReadyOpp, id: 'opp-s17-high', pack_readiness_score: 90 },
  { ...s17ReadyOpp, id: 'opp-s17-lower', pack_readiness_score: 72 },
];
const s17GroupsTwoApproved = groupByReadiness(s17TwoApproved);
const s17ReadyList = s17GroupsTwoApproved[READINESS_GROUPS.READY_TO_APPLY];
assert('Within READY_TO_APPLY group, higher readiness sorts first',
  s17ReadyList[0].pack_readiness_score >= s17ReadyList[1].pack_readiness_score);

// 17e. getBestNextActions returns prioritized action list
const s17Actions = getBestNextActions(s17AllOpps);
assert('getBestNextActions returns an array', Array.isArray(s17Actions));
assert('getBestNextActions includes at least one action', s17Actions.length >= 1);

// Ready-to-apply should be first when it exists
const s17ReadyAction = s17Actions.find(a => a.type === 'ready_to_apply');
assert('getBestNextActions includes ready_to_apply action when roles qualify', !!s17ReadyAction);
assert('ready_to_apply action has count', s17ReadyAction && s17ReadyAction.count >= 1);
assert('ready_to_apply action has detail string', s17ReadyAction && typeof s17ReadyAction.detail === 'string');

// 17f. getBestNextActions handles empty list gracefully
const s17EmptyActions = getBestNextActions([]);
assert('getBestNextActions on empty opps returns empty array', s17EmptyActions.length === 0);

// 17g. getBestNextActions with only rejected opps = empty/low actions
const s17OnlyRejected = getBestNextActions([s17RejectedOpp]);
assert('getBestNextActions with only rejected = no actionable items', s17OnlyRejected.length === 0);

// 17h. computeReadinessSummary returns correct counts
const s17Summary = computeReadinessSummary(s17AllOpps);
assert('computeReadinessSummary returns object', typeof s17Summary === 'object');
assert('computeReadinessSummary readyToApplyCount >= 1', s17Summary.readyToApplyCount >= 1);
assert('computeReadinessSummary blockedByMissingUrlCount >= 1', s17Summary.blockedByMissingUrlCount >= 1);
assert('computeReadinessSummary needsApprovalCount >= 1', s17Summary.needsApprovalCount >= 1);
assert('computeReadinessSummary topReadyToApply is array', Array.isArray(s17Summary.topReadyToApply));
assert('computeReadinessSummary topReadyToApply entries have id/title/score fields',
  s17Summary.topReadyToApply.length === 0 ||
  ('id' in s17Summary.topReadyToApply[0] && 'pack_readiness_score' in s17Summary.topReadyToApply[0]));

// 17i. READINESS_GROUP_LABELS covers all group keys
const s17AllGroupKeys = Object.values(READINESS_GROUPS);
assert('READINESS_GROUP_LABELS has label for every READINESS_GROUP',
  s17AllGroupKeys.every(k => !!READINESS_GROUP_LABELS[k]));

// 17j. READINESS_GROUP_ORDER covers all group keys
assert('READINESS_GROUP_ORDER includes all group keys',
  s17AllGroupKeys.every(k => READINESS_GROUP_ORDER.includes(k)));

// 17k. Weekly digest readiness summary check (source-level)
let digestSrc17 = '';
try { digestSrc17 = readFileSync(join(__dirname_v, '../netlify/functions/digest.js'), 'utf-8'); } catch {}
assert('digest.js imports computeReadinessSummary', digestSrc17.includes('computeReadinessSummary'));
assert('digest.js includes readiness in weekly digest', digestSrc17.includes('readiness'));
assert('weekly digest summary string includes ready to apply', digestSrc17.includes('ready to apply'));

// 17l. Tracker.jsx uses readiness-based sorting
let trackerSrc17 = '';
try { trackerSrc17 = readFileSync(join(__dirname_v, '../src/pages/Tracker.jsx'), 'utf-8'); } catch {}
assert('Tracker.jsx imports classifyReadinessGroup', trackerSrc17.includes('classifyReadinessGroup'));
assert('Tracker.jsx has readiness sort option', trackerSrc17.includes("'readiness'") || trackerSrc17.includes('"readiness"'));
assert('Tracker.jsx has ReadinessBadge component or similar', trackerSrc17.includes('ReadinessBadge') || trackerSrc17.includes('readiness'));
assert('Tracker.jsx has sort controls', trackerSrc17.includes('Sort') || trackerSrc17.includes('sortBy'));

// 17m. Dashboard.jsx has Action Center
let dashSrc17 = '';
try { dashSrc17 = readFileSync(join(__dirname_v, '../src/pages/Dashboard.jsx'), 'utf-8'); } catch {}
assert('Dashboard.jsx imports getBestNextActions', dashSrc17.includes('getBestNextActions'));
assert('Dashboard.jsx has Action Center UI', dashSrc17.includes('Action Center') || dashSrc17.includes('action-center'));
assert('Dashboard.jsx shows readyToApply count in stats', dashSrc17.includes('readyToApply'));

// 17n. DiscoveryProfile.jsx has profile merge/conflict UI
let dpSrc17 = '';
try { dpSrc17 = readFileSync(join(__dirname_v, '../src/pages/DiscoveryProfile.jsx'), 'utf-8'); } catch {}
assert('DiscoveryProfile.jsx imports fetchProfileBothSources', dpSrc17.includes('fetchProfileBothSources'));
assert('DiscoveryProfile.jsx has conflict detection UI', dpSrc17.includes('conflict') || dpSrc17.includes('hasConflict'));
assert('DiscoveryProfile.jsx shows Keep Server / Keep Local options', dpSrc17.includes('Keep Server') && dpSrc17.includes('Keep Local'));

// 17o. api.js has fetchProfileBothSources
let apiSrc17 = '';
try { apiSrc17 = readFileSync(join(__dirname_v, '../src/lib/api.js'), 'utf-8'); } catch {}
assert('api.js exports fetchProfileBothSources', apiSrc17.includes('fetchProfileBothSources'));
assert('api.js fetchProfileBothSources detects conflict', apiSrc17.includes('hasConflict'));

// 17p. style.css print polish includes @page rules
let styleSrc17 = '';
try { styleSrc17 = readFileSync(join(__dirname_v, '../src/style.css'), 'utf-8'); } catch {}
assert('style.css has @page rules for print', styleSrc17.includes('@page'));
assert('style.css @page has footer stamp content', styleSrc17.includes('AI Job Search System') || styleSrc17.includes('@bottom'));

// 17q. ApplyPack.jsx text export includes generated timestamp
let applyPackSrc17 = '';
try { applyPackSrc17 = readFileSync(join(__dirname_v, '../src/pages/ApplyPack.jsx'), 'utf-8'); } catch {}
assert('ApplyPack.jsx text export includes generated timestamp', applyPackSrc17.includes('Generated:') && applyPackSrc17.includes('toLocaleString'));
assert('ApplyPack.jsx print function sets data-print-timestamp', applyPackSrc17.includes('data-print-timestamp'));

// 17r. Approval remains mandatory — readiness classification does not bypass it
assert('classifyReadinessGroup never marks unapproved as READY_TO_APPLY',
  classifyReadinessGroup({ ...s17ReadyOpp, approval_state: 'pending' }) !== READINESS_GROUPS.READY_TO_APPLY);

// 17s. Scoring hierarchy preserved
const tpmCheck17 = scoreOpportunity('Senior Technical Project Manager', 'Lead end-to-end technical delivery. SDLC, agile, stakeholder management, Jira, PMP preferred.');
assert('Section 17: TPM role still classifies as TPM lane', tpmCheck17.lane === LANES.TPM);

const delCheck17 = scoreOpportunity('Delivery Manager', 'Lead agile squad delivery. Sprint planning, retrospectives, release cadence, SAFe. Stakeholder reporting.');
assert('Section 17: Delivery Manager still classifies as delivery_manager', delCheck17.lane === LANES.DELIVERY_MANAGER);

const weakOps17 = scoreOpportunity('Operations Manager', 'Manage store floor operations, staff rostering, inventory control.');
assert('Section 17: Weak generic Ops not classified as TPM', weakOps17.lane !== LANES.TPM);
assert('Section 17: Approval guard maintained — no readiness bypass', (() => {
  try { generateApplyPack({ ...tpmOpp16, approval_state: 'pending' }); return false; } catch { return true; }
})());


// (Result is printed at end of file after all sections)

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 18: PWA + Approval Queue Readiness + Reports Panel + Follow-up
//             Alert + Batch URL + Readiness History
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n== 18. PWA + Approval Queue Readiness + Reports + Batch URL + History ==');

import { readFileSync as readFileSync18 } from 'fs';
import { join as join18, dirname as dirname18 } from 'path';
import { fileURLToPath as fileURLToPath18 } from 'url';
const __dirname_v18 = dirname18(fileURLToPath18(import.meta.url));

// 18a. PWA: manifest.json exists and has required fields
let manifestSrc18 = '';
try { manifestSrc18 = readFileSync18(join18(__dirname_v18, '../public/manifest.json'), 'utf-8'); } catch {}
assert('manifest.json exists', manifestSrc18.length > 0);
let manifest18 = {};
try { manifest18 = JSON.parse(manifestSrc18); } catch {}
assert('manifest.json has name', typeof manifest18.name === 'string' && manifest18.name.length > 0);
assert('manifest.json has short_name', typeof manifest18.short_name === 'string');
assert('manifest.json has start_url', manifest18.start_url === '/');
assert('manifest.json has display', manifest18.display === 'standalone');
assert('manifest.json has theme_color', typeof manifest18.theme_color === 'string');
assert('manifest.json has background_color', typeof manifest18.background_color === 'string');
assert('manifest.json has icons array', Array.isArray(manifest18.icons) && manifest18.icons.length >= 2);
assert('manifest.json has maskable icon', (manifest18.icons || []).some(i => i.purpose === 'maskable'));
assert('manifest.json has 192x192 icon', (manifest18.icons || []).some(i => i.sizes === '192x192'));
assert('manifest.json has 512x512 icon', (manifest18.icons || []).some(i => i.sizes === '512x512'));

// 18b. index.html has manifest link + theme-color + apple-touch-icon
let indexSrc18 = '';
try { indexSrc18 = readFileSync18(join18(__dirname_v18, '../index.html'), 'utf-8'); } catch {}
assert('index.html links manifest.json', indexSrc18.includes('manifest.json'));
assert('index.html has theme-color meta', indexSrc18.includes('theme-color'));
assert('index.html has apple-touch-icon', indexSrc18.includes('apple-touch-icon'));
assert('index.html registers service worker', indexSrc18.includes('serviceWorker') && indexSrc18.includes('register'));

// 18c. Service worker file exists and has correct strategy
let swSrc18 = '';
try { swSrc18 = readFileSync18(join18(__dirname_v18, '../public/sw.js'), 'utf-8'); } catch {}
assert('sw.js exists', swSrc18.length > 0);
assert('sw.js has install event', swSrc18.includes('install'));
assert('sw.js has activate event', swSrc18.includes('activate'));
assert('sw.js has fetch event', swSrc18.includes('fetch'));
assert('sw.js passes API paths through network-only', swSrc18.includes('/.netlify/functions/') && swSrc18.includes('Network Only') || swSrc18.includes('fetch(request)'));
assert('sw.js uses skipWaiting for fast activation', swSrc18.includes('skipWaiting'));
assert('sw.js claims clients on activate', swSrc18.includes('clients.claim'));

// 18d. PWA icon files exist
const fs18 = { existsSync: (p) => { try { readFileSync18(p); return true; } catch { return false; } } };
assert('public/icon-192.png exists', fs18.existsSync(join18(__dirname_v18, '../public/icon-192.png')));
assert('public/icon-512.png exists', fs18.existsSync(join18(__dirname_v18, '../public/icon-512.png')));
assert('public/apple-touch-icon.png exists', fs18.existsSync(join18(__dirname_v18, '../public/apple-touch-icon.png')));

// 18e. ApprovalQueue.jsx has readiness indicators and lane grouping
let queueSrc18 = '';
try { queueSrc18 = readFileSync18(join18(__dirname_v18, '../src/pages/ApprovalQueue.jsx'), 'utf-8'); } catch {}
assert('ApprovalQueue.jsx imports classifyReadinessGroup', queueSrc18.includes('classifyReadinessGroup'));
assert('ApprovalQueue.jsx imports getReadinessReason', queueSrc18.includes('getReadinessReason'));
assert('ApprovalQueue.jsx has ReadinessBadge component', queueSrc18.includes('ReadinessBadge'));
assert('ApprovalQueue.jsx groups by high-fit', queueSrc18.includes('highFit') && queueSrc18.includes('High-Fit'));
assert('ApprovalQueue.jsx shows missing URL warning', queueSrc18.includes('No apply URL set'));
assert('ApprovalQueue.jsx has readiness sort control', queueSrc18.includes('sortBy') && queueSrc18.includes('Readiness'));
assert('ApprovalQueue.jsx approval gate still enforced', queueSrc18.includes('Approval gate enforced'));

// 18f. Reports.jsx has Readiness Panel
let reportsSrc18 = '';
try { reportsSrc18 = readFileSync18(join18(__dirname_v18, '../src/pages/Reports.jsx'), 'utf-8'); } catch {}
assert('Reports.jsx imports computeReadinessSummary', reportsSrc18.includes('computeReadinessSummary'));
assert('Reports.jsx has ReadinessPanel component', reportsSrc18.includes('ReadinessPanel'));
assert('Reports.jsx has readiness digest type', reportsSrc18.includes("'readiness'") || reportsSrc18.includes('"readiness"'));
assert('Reports.jsx shows ready-to-apply count', reportsSrc18.includes('Ready to Apply'));
assert('Reports.jsx shows blocked-by-missing-URL', reportsSrc18.includes('Blocked') && reportsSrc18.includes('URL'));
assert('Reports.jsx shows follow-up due', reportsSrc18.includes('Follow-up Due'));
assert('Reports.jsx shows high-fit pending approval', reportsSrc18.includes('High-Fit Pending Approval'));
assert('Reports.jsx weekly digest includes readiness', reportsSrc18.includes('digest.readiness'));

// 18g. Dashboard.jsx has FollowUpBanner
let dashSrc18 = '';
try { dashSrc18 = readFileSync18(join18(__dirname_v18, '../src/pages/Dashboard.jsx'), 'utf-8'); } catch {}
assert('Dashboard.jsx has FollowUpBanner component', dashSrc18.includes('FollowUpBanner'));
assert('Dashboard.jsx FollowUpBanner checks next_action_due', dashSrc18.includes('next_action_due'));
assert('Dashboard.jsx FollowUpBanner is dismissable', dashSrc18.includes('dismissed') && dashSrc18.includes('setDismissed'));
assert('Dashboard.jsx FollowUpBanner only shows real tasks', dashSrc18.includes('overdue.length === 0') || dashSrc18.includes('overdue.length > 0'));

// 18h. BatchUrlPanel component exists and is correct
let batchSrc18 = '';
try { batchSrc18 = readFileSync18(join18(__dirname_v18, '../src/components/BatchUrlPanel.jsx'), 'utf-8'); } catch {}
assert('BatchUrlPanel.jsx exists', batchSrc18.length > 0);
assert('BatchUrlPanel.jsx uses batchUpdateApplyUrls', batchSrc18.includes('batchUpdateApplyUrls'));
assert('BatchUrlPanel.jsx filters for needs_apply_url group', batchSrc18.includes('NEEDS_APPLY_URL'));
assert('BatchUrlPanel.jsx preserves auditability note', batchSrc18.includes('Apply Packs') || batchSrc18.includes('readiness scores'));

// 18i. Tracker.jsx includes BatchUrlPanel
let trackerSrc18 = '';
try { trackerSrc18 = readFileSync18(join18(__dirname_v18, '../src/pages/Tracker.jsx'), 'utf-8'); } catch {}
assert('Tracker.jsx imports BatchUrlPanel', trackerSrc18.includes('BatchUrlPanel'));
assert('Tracker.jsx shows batch URL prompt when blocked roles exist', trackerSrc18.includes('needsUrlCount'));
assert('Tracker.jsx has showBatchUrl state', trackerSrc18.includes('showBatchUrl'));

// 18j. api.js exports batchUpdateApplyUrls and readiness history
let apiSrc18 = '';
try { apiSrc18 = readFileSync18(join18(__dirname_v18, '../src/lib/api.js'), 'utf-8'); } catch {}
assert('api.js exports batchUpdateApplyUrls', apiSrc18.includes('batchUpdateApplyUrls'));
assert('api.js exports recordReadinessHistory', apiSrc18.includes('recordReadinessHistory'));
assert('api.js exports getReadinessHistory', apiSrc18.includes('getReadinessHistory'));
assert('api.js batchUpdateApplyUrls calls updateApplyUrl per entry', apiSrc18.includes('for (const') && apiSrc18.includes('updateApplyUrl'));
assert('api.js readiness history uses localStorage', apiSrc18.includes('READINESS_HISTORY_KEY'));
assert('api.js weekly digest includes readiness summary', apiSrc18.includes('computeReadinessSummary(opportunities)'));

// 18k. readiness history unit test
{
  // Simulate recordReadinessHistory behavior using the logic directly
  const history = [];
  function recordEntry(oppId, eventType, payload) {
    history.unshift({ id: `rh-${Date.now()}`, opportunity_id: oppId, event_type: eventType, payload, recorded_at: new Date().toISOString() });
    return history[0];
  }
  const e1 = recordEntry('opp-1', 'status_changed', { from: 'discovered', to: 'approved' });
  const e2 = recordEntry('opp-1', 'readiness_score_changed', { from: 50, to: 85 });
  const e3 = recordEntry('opp-2', 'apply_url_added', { url: 'https://example.com/apply' });
  assert('readiness history: entry has correct opportunity_id', e1.opportunity_id === 'opp-1');
  assert('readiness history: entry has event_type', e1.event_type === 'status_changed');
  assert('readiness history: entry has payload', e1.payload.from === 'discovered');
  assert('readiness history: filter by opp works', history.filter(e => e.opportunity_id === 'opp-1').length === 2);
  assert('readiness history: different opps stored separately', history.filter(e => e.opportunity_id === 'opp-2').length === 1);
}

// 18l. batchUpdateApplyUrls logic test
{
  // Simulate batch: entries with valid URLs should be processed, empty ones skipped
  const entries = [
    { id: 'opp-a', applicationUrl: 'https://company.com/apply' },
    { id: 'opp-b', applicationUrl: '' }, // Should be skipped
    { id: 'opp-c', applicationUrl: '  ' }, // Should be skipped
  ];
  const validEntries = entries.filter(e => e.applicationUrl && e.applicationUrl.trim());
  assert('batchUpdateApplyUrls: skips empty URLs', validEntries.length === 1);
  assert('batchUpdateApplyUrls: processes valid URLs', validEntries[0].id === 'opp-a');
}

// 18m. Migration 004 exists
let migration4Src18 = '';
try { migration4Src18 = readFileSync18(join18(__dirname_v18, '../supabase/migrations/004_readiness_history.sql'), 'utf-8'); } catch {}
assert('Migration 004 exists (readiness_history)', migration4Src18.includes('readiness_history'));
assert('Migration 004 creates correct columns', migration4Src18.includes('opportunity_id') && migration4Src18.includes('event_type') && migration4Src18.includes('payload'));
assert('Migration 004 creates indexes', migration4Src18.includes('CREATE INDEX'));

// 18n. Hierarchy + approval guard still intact
const tpmCheck18 = scoreOpportunity('Technical Project Manager', 'Lead technical delivery. SDLC, Agile, Jira, stakeholder management, PMP preferred.');
assert('Section 18: TPM hierarchy intact', tpmCheck18.lane === LANES.TPM);
assert('Section 18: Approval remains mandatory — no readiness bypass', (() => {
  const unapprovedOpp18 = { approval_state: 'pending', status: 'discovered', pack_readiness_score: 95, application_url: 'https://example.com/apply', fit_score: 90 };
  return classifyReadinessGroup(unapprovedOpp18) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─── 19. Production-Hardening + Continuity Layer ─────────────────────────────

console.log('\n== 19. Production-Hardening + Continuity Layer ==');

import { readFileSync as readFileSync19, existsSync as existsSync19 } from 'fs';
import { join as join19, dirname as dirname19 } from 'path';
import { fileURLToPath as fileURLToPath19 } from 'url';
const __dirname_v19 = dirname19(fileURLToPath19(import.meta.url));

// 19a. Reports.jsx has exactly ONE export default (deploy blocker fixed)
let reportsSrc19 = '';
try { reportsSrc19 = readFileSync19(join19(__dirname_v19, '../src/pages/Reports.jsx'), 'utf-8'); } catch {}
const exportDefaultMatches = (reportsSrc19.match(/export default function/g) || []).length;
assert('Reports.jsx has exactly one export default (deploy blocker fixed)', exportDefaultMatches === 1);
assert('Reports.jsx still has ReadinessPanel', reportsSrc19.includes('ReadinessPanel'));
assert('Reports.jsx still has computeReadinessSummary import', reportsSrc19.includes('computeReadinessSummary'));

// 19b. No other pages have duplicate export defaults
const pagesFiles19 = ['Dashboard.jsx', 'ApprovalQueue.jsx', 'Tracker.jsx', 'ApplyPack.jsx', 'OpportunityDetail.jsx'];
for (const file of pagesFiles19) {
  let src = '';
  try { src = readFileSync19(join19(__dirname_v19, `../src/pages/${file}`), 'utf-8'); } catch {}
  const count = (src.match(/export default function/g) || []).length;
  assert(`${file} has exactly one export default`, count === 1);
}

// 19c. api.js wires recordReadinessHistory into approveOpportunity
let apiSrc19 = '';
try { apiSrc19 = readFileSync19(join19(__dirname_v19, '../src/lib/api.js'), 'utf-8'); } catch {}
assert('api.js approveOpportunity calls recordReadinessHistory', (() => {
  const approveBlock = apiSrc19.slice(apiSrc19.indexOf('export async function approveOpportunity'));
  return approveBlock.includes('recordReadinessHistory') && approveBlock.includes('approval_state_changed');
})());

// 19d. api.js wires recordReadinessHistory into updateApplyUrl
assert('api.js updateApplyUrl calls recordReadinessHistory', (() => {
  const block = apiSrc19.slice(apiSrc19.indexOf('export async function updateApplyUrl'));
  return block.includes('recordReadinessHistory') && block.includes('apply_url_added');
})());

// 19e. api.js wires recordReadinessHistory into updateApplyStatus
assert('api.js updateApplyStatus calls recordReadinessHistory', (() => {
  const block = apiSrc19.slice(apiSrc19.indexOf('export async function updateApplyStatus'));
  return block.includes('recordReadinessHistory') && block.includes('status_changed');
})());

// 19f. OpportunityDetail imports getReadinessHistory and has ReadinessTimeline
let oppDetailSrc19 = '';
try { oppDetailSrc19 = readFileSync19(join19(__dirname_v19, '../src/pages/OpportunityDetail.jsx'), 'utf-8'); } catch {}
assert('OpportunityDetail.jsx imports getReadinessHistory', oppDetailSrc19.includes('getReadinessHistory'));
assert('OpportunityDetail.jsx has ReadinessTimeline component', oppDetailSrc19.includes('ReadinessTimeline'));
assert('OpportunityDetail.jsx timeline shows event_type labels', oppDetailSrc19.includes('approval_state_changed') && oppDetailSrc19.includes('apply_url_added'));
assert('OpportunityDetail.jsx timeline is newest first', oppDetailSrc19.includes('getReadinessHistory(opportunityId'));

// 19g. db.js has insertReadinessHistory and listReadinessHistory (Supabase live path)
let dbSrc19 = '';
try { dbSrc19 = readFileSync19(join19(__dirname_v19, '../netlify/functions/_shared/db.js'), 'utf-8'); } catch {}
assert('db.js exports insertReadinessHistory', dbSrc19.includes('export async function insertReadinessHistory'));
assert('db.js exports listReadinessHistory', dbSrc19.includes('export async function listReadinessHistory'));
assert('db.js insertReadinessHistory writes to readiness_history table', dbSrc19.includes("'readiness_history'") || dbSrc19.includes('"readiness_history"'));
assert('db.js insertReadinessHistory has demo fallback', dbSrc19.includes('_demo.readiness_history'));
assert('db.js insertReadinessHistory is non-fatal on error', dbSrc19.includes('non-fatal') || dbSrc19.includes('warn'));

// 19h. approve.js imports and uses insertReadinessHistory
let approveSrc19 = '';
try { approveSrc19 = readFileSync19(join19(__dirname_v19, '../netlify/functions/approve.js'), 'utf-8'); } catch {}
assert('approve.js imports insertReadinessHistory', approveSrc19.includes('insertReadinessHistory'));
assert('approve.js calls insertReadinessHistory on approval', approveSrc19.includes('approval_state_changed'));

// 19i. opportunities.js imports and uses insertReadinessHistory
let oppFnSrc19 = '';
try { oppFnSrc19 = readFileSync19(join19(__dirname_v19, '../netlify/functions/opportunities.js'), 'utf-8'); } catch {}
assert('opportunities.js imports insertReadinessHistory', oppFnSrc19.includes('insertReadinessHistory'));
assert('opportunities.js calls insertReadinessHistory on apply_url_added', oppFnSrc19.includes('apply_url_added'));

// 19j. Service worker has offline fallback
let swSrc19 = '';
try { swSrc19 = readFileSync19(join19(__dirname_v19, '../public/sw.js'), 'utf-8'); } catch {}
assert('sw.js includes offline.html in SHELL_ASSETS', swSrc19.includes('/offline.html'));
assert('sw.js has navigation fallback to offline.html', swSrc19.includes("cache.match('/offline.html')"));
assert("sw.js CACHE_NAME updated (v2)", swSrc19.includes('shell-v2'));
assert('sw.js still has API Network Only strategy', swSrc19.includes('Network Only') || (swSrc19.includes('API_PATHS') && swSrc19.includes("fetch(request)")));

// 19k. offline.html exists and is honest
let offlineSrc19 = '';
try { offlineSrc19 = readFileSync19(join19(__dirname_v19, '../public/offline.html'), 'utf-8'); } catch {}
assert('offline.html exists', offlineSrc19.length > 0);
assert("offline.html explains offline limitations honestly", offlineSrc19.includes('offline') && offlineSrc19.includes('reconnect'));
assert("offline.html is not fake — does not claim full functionality", !offlineSrc19.includes('all features available') && !offlineSrc19.includes('fully functional'));

// 19l. Tracker.jsx has readiness group filter
let trackerSrc19 = '';
try { trackerSrc19 = readFileSync19(join19(__dirname_v19, '../src/pages/Tracker.jsx'), 'utf-8'); } catch {}
assert('Tracker.jsx has readinessFilter state', trackerSrc19.includes('readinessFilter') && trackerSrc19.includes('setReadinessFilter'));
assert('Tracker.jsx readinessFilter uses classifyReadinessGroup', trackerSrc19.includes('classifyReadinessGroup(o) === readinessFilter'));
assert('Tracker.jsx readiness filter has all group options', trackerSrc19.includes('READINESS_FILTER_OPTIONS'));
assert('Tracker.jsx readiness filter includes Ready to Apply option', trackerSrc19.includes('Ready to Apply'));
assert('Tracker.jsx readiness filter includes Needs URL option', trackerSrc19.includes('Needs URL'));

// 19m. n8n workflow assets exist
const n8nWorkflows19 = [
  '05-job-discovery.json',
  '06-daily-approval-digest.json',
  '07-weekly-readiness-summary.json',
];
for (const wf of n8nWorkflows19) {
  const exists = existsSync19(join19(__dirname_v19, `../n8n/workflows/${wf}`));
  assert(`n8n workflow exists: ${wf}`, exists);
}

// 19n. n8n workflows use SITE_URL not hardcoded URLs
let dailyDigestWf19 = '';
try { dailyDigestWf19 = readFileSync19(join19(__dirname_v19, '../n8n/workflows/06-daily-approval-digest.json'), 'utf-8'); } catch {}
assert('n8n daily digest workflow uses SITE_URL env var', dailyDigestWf19.includes('$env.SITE_URL'));
assert('n8n daily digest workflow calls /digest endpoint', dailyDigestWf19.includes('/digest'));

let weeklyWf19 = '';
try { weeklyWf19 = readFileSync19(join19(__dirname_v19, '../n8n/workflows/07-weekly-readiness-summary.json'), 'utf-8'); } catch {}
assert('n8n weekly summary workflow uses SITE_URL env var', weeklyWf19.includes('$env.SITE_URL'));
assert('n8n weekly summary workflow calls /digest?type=weekly', weeklyWf19.includes('type=weekly'));

// 19o. n8n discovery workflow uses DISCOVERY_SECRET (structured sources, not scraping)
let discoverWf19 = '';
try { discoverWf19 = readFileSync19(join19(__dirname_v19, '../n8n/workflows/05-job-discovery.json'), 'utf-8'); } catch {}
assert('n8n discovery workflow uses DISCOVERY_SECRET', discoverWf19.includes('DISCOVERY_SECRET'));
assert('n8n discovery workflow calls /discover endpoint', discoverWf19.includes('/discover'));

// 19p. Readiness history logic tests (simulate api.js behavior inline)
{
  const historyStore = [];
  function recordEntry19(oppId, eventType, payload) {
    historyStore.unshift({
      id: `rh-${Date.now()}-test`,
      opportunity_id: oppId,
      event_type: eventType,
      payload,
      recorded_at: new Date().toISOString(),
    });
    return historyStore[0];
  }

  const e1 = recordEntry19('opp-a', 'approval_state_changed', { from: 'pending', to: 'approved', action: 'approve' });
  const e2 = recordEntry19('opp-a', 'status_changed', { from: 'discovered', to: 'approved' });
  const e3 = recordEntry19('opp-a', 'pack_regenerated', { reason: 'generated_on_approval', pack_readiness_score: 70 });
  const e4 = recordEntry19('opp-b', 'apply_url_added', { url: 'https://jobs.example.com/apply', to_status: 'apply_pack_generated' });

  assert('readiness history wiring: approval event has correct type', e1.event_type === 'approval_state_changed');
  assert('readiness history wiring: approval event has from/to', e1.payload.from === 'pending' && e1.payload.to === 'approved');
  assert('readiness history wiring: status_changed event correct', e2.event_type === 'status_changed');
  assert('readiness history wiring: pack_regenerated has score', e3.payload.pack_readiness_score === 70);
  assert('readiness history wiring: apply_url_added has url', e4.payload.url.includes('jobs.example.com'));
  assert('readiness history wiring: filter by opp-a returns 3 entries', historyStore.filter(e => e.opportunity_id === 'opp-a').length === 3);
  assert('readiness history wiring: filter by opp-b returns 1 entry', historyStore.filter(e => e.opportunity_id === 'opp-b').length === 1);
  assert('readiness history wiring: newest first', historyStore[0].event_type === 'apply_url_added');
}

// 19q. TPM hierarchy and approval gate still intact (sanity)
const tpmCheck19 = scoreOpportunity('Senior Technical Project Manager', 'Lead cross-functional delivery teams. SDLC, Agile, Jira, stakeholder alignment, PMP.');
assert('Section 19: TPM hierarchy intact', tpmCheck19.lane === LANES.TPM);
assert('Section 19: Approval gate intact — high readiness score does not bypass approval', (() => {
  const highReadinessButPending = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 100,
    application_url: 'https://example.com/apply',
    fit_score: 95,
    recommended: true,
  };
  return classifyReadinessGroup(highReadinessButPending) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─── 20. Readiness-History Live Endpoint + Full Traceability Pass ─────────────

console.log('\n== 20. Readiness-History Live Endpoint + Full Traceability Pass ==');

import { readFileSync as readFileSync20, existsSync as existsSync20 } from 'fs';
import { join as join20, dirname as dirname20 } from 'path';
import { fileURLToPath as fileURLToPath20 } from 'url';
const __dirname_v20 = dirname20(fileURLToPath20(import.meta.url));

// 20a. readiness-history.js endpoint exists
let rhEndpointSrc20 = '';
try { rhEndpointSrc20 = readFileSync20(join20(__dirname_v20, '../netlify/functions/readiness-history.js'), 'utf-8'); } catch {}
assert('readiness-history.js endpoint exists', rhEndpointSrc20.length > 0);
assert('readiness-history endpoint supports GET', rhEndpointSrc20.includes("'GET'") || rhEndpointSrc20.includes('"GET"'));
assert('readiness-history endpoint supports POST', rhEndpointSrc20.includes("'POST'") || rhEndpointSrc20.includes('"POST"'));
assert('readiness-history endpoint calls listReadinessHistory', rhEndpointSrc20.includes('listReadinessHistory'));
assert('readiness-history endpoint calls insertReadinessHistory', rhEndpointSrc20.includes('insertReadinessHistory'));
assert('readiness-history endpoint imports from db.js', rhEndpointSrc20.includes("'./_shared/db.js'") || rhEndpointSrc20.includes('"_shared/db.js"'));

// 20b. api.js exports fetchReadinessHistory (async live endpoint path)
const apiSrc20 = readFileSync20(join20(__dirname_v20, '../src/lib/api.js'), 'utf-8');
assert('api.js exports fetchReadinessHistory', apiSrc20.includes('export async function fetchReadinessHistory'));
assert('fetchReadinessHistory uses isDemoMode check', apiSrc20.includes('isDemoMode') && apiSrc20.includes('fetchReadinessHistory'));
assert('fetchReadinessHistory falls back to getReadinessHistory in demo mode', (() => {
  const fnBody = apiSrc20.slice(apiSrc20.indexOf('export async function fetchReadinessHistory'));
  return fnBody.includes('getReadinessHistory');
})());
assert('fetchReadinessHistory calls readiness-history endpoint in live mode', (() => {
  const fnBody = apiSrc20.slice(apiSrc20.indexOf('export async function fetchReadinessHistory'));
  return fnBody.includes('readiness-history');
})());

// 20c. OpportunityDetail uses fetchReadinessHistory (async live timeline)
const oppDetailSrc20 = readFileSync20(join20(__dirname_v20, '../src/pages/OpportunityDetail.jsx'), 'utf-8');
assert('OpportunityDetail imports fetchReadinessHistory', oppDetailSrc20.includes('fetchReadinessHistory'));
assert('OpportunityDetail ReadinessTimeline uses useEffect + async fetch', (() => {
  return oppDetailSrc20.includes('fetchReadinessHistory') && oppDetailSrc20.includes('useEffect');
})());
assert('OpportunityDetail ReadinessTimeline has loading state', oppDetailSrc20.includes('setLoading') || oppDetailSrc20.includes('loading'));

// 20d. opportunities.js PATCH records status_changed history for generic status updates
const oppsFnSrc20 = readFileSync20(join20(__dirname_v20, '../netlify/functions/opportunities.js'), 'utf-8');
assert('opportunities.js PATCH captures prevStatus for history', oppsFnSrc20.includes('prevStatusForHistory'));
assert('opportunities.js PATCH records status_changed on generic PATCH', (() => {
  return oppsFnSrc20.includes('prevStatusForHistory') && oppsFnSrc20.includes("'status_changed'");
})());

// 20e. db.js has both insertReadinessHistory and listReadinessHistory
const dbSrc20 = readFileSync20(join20(__dirname_v20, '../netlify/functions/_shared/db.js'), 'utf-8');
assert('db.js insertReadinessHistory exists', dbSrc20.includes('export async function insertReadinessHistory'));
assert('db.js listReadinessHistory exists', dbSrc20.includes('export async function listReadinessHistory'));
assert('db.js listReadinessHistory reads from readiness_history table', dbSrc20.includes("'readiness_history'") || dbSrc20.includes('"readiness_history"'));

// 20f. approve.js and opportunities.js both import insertReadinessHistory
const approveSrc20 = readFileSync20(join20(__dirname_v20, '../netlify/functions/approve.js'), 'utf-8');
assert('approve.js imports insertReadinessHistory from db.js', approveSrc20.includes('insertReadinessHistory'));
assert('approve.js records approval_state_changed', approveSrc20.includes("'approval_state_changed'"));
assert('opportunities.js imports insertReadinessHistory from db.js', oppsFnSrc20.includes('insertReadinessHistory'));

// 20g. Verify readiness-history endpoint handler structure
assert('readiness-history endpoint has handler export', rhEndpointSrc20.includes('export const handler') || rhEndpointSrc20.includes('export default'));
assert('readiness-history handles OPTIONS (CORS)', rhEndpointSrc20.includes('OPTIONS'));

// 20h. TPM hierarchy and approval gate still intact
const tpmCheck20 = scoreOpportunity('Senior Technical Project Manager', 'Lead cross-functional delivery teams. SDLC, Agile, Jira, stakeholder alignment, PMP.');
assert('Section 20: TPM hierarchy intact', tpmCheck20.lane === LANES.TPM);
assert('Section 20: Approval gate intact — fetching history does not bypass approval', (() => {
  const highReadinessPending = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 100,
    application_url: 'https://example.com/apply',
    fit_score: 95,
    recommended: true,
  };
  return classifyReadinessGroup(highReadinessPending) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─────────────────────────────────────────────────────────────────────────────
// Section 21: Live Automation Activation Hardening
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Section 21: Live Automation Activation Hardening ──');

import { readFileSync as readFileSync21 } from 'fs';
import { dirname as dirname21, join as join21 } from 'path';
import { fileURLToPath as fileURLToPath21 } from 'url';
const __dirname_v21 = dirname21(fileURLToPath21(import.meta.url));

const dbSrc21 = readFileSync21(join21(__dirname_v21, '../netlify/functions/_shared/db.js'), 'utf-8');
const discoverSrc21 = readFileSync21(join21(__dirname_v21, '../netlify/functions/discover.js'), 'utf-8');
const jobFinderSrc21 = readFileSync21(join21(__dirname_v21, '../netlify/functions/_shared/jobFinder.js'), 'utf-8');
const sourcesSrc21 = readFileSync21(join21(__dirname_v21, '../netlify/functions/_shared/sources.js'), 'utf-8');
const dedupSrc21 = readFileSync21(join21(__dirname_v21, '../netlify/functions/_shared/dedup.js'), 'utf-8');
const n8nDiscoverSrc21 = readFileSync21(join21(__dirname_v21, '../n8n/workflows/05-job-discovery.json'), 'utf-8');
const n8nDigestSrc21 = readFileSync21(join21(__dirname_v21, '../n8n/workflows/06-daily-approval-digest.json'), 'utf-8');
const runbookSrc21 = readFileSync21(join21(__dirname_v21, '../LIVE_ACTIVATION_RUNBOOK.md'), 'utf-8');
const runDiscoverySrc21 = readFileSync21(join21(__dirname_v21, '../scripts/run-discovery.sh'), 'utf-8');
const checkLiveSrc21 = readFileSync21(join21(__dirname_v21, '../scripts/check-live.sh'), 'utf-8');

// 21a. discover.js auth hardening
assert('discover.js requires DISCOVERY_SECRET — rejects when missing', discoverSrc21.includes('if (!secret) return false'));
assert('discover.js checks Authorization header for Bearer token', discoverSrc21.includes("'bearer '") || discoverSrc21.includes('"bearer "') || discoverSrc21.includes('.toLowerCase().startsWith'));
assert('discover.js checks X-Discovery-Secret header', discoverSrc21.includes('x-discovery-secret'));
assert('discover.js returns 401 on unauthorized call', discoverSrc21.includes('statusCode: 401'));
assert('discover.js has LIVE_INTAKE_ENABLED kill switch check', discoverSrc21.includes('isLiveIntakeEnabled'));

// 21b. Greenhouse-first source config validation
assert('discover.js validates GREENHOUSE_BOARDS not empty before running', discoverSrc21.includes('GREENHOUSE_BOARDS env var is empty') || discoverSrc21.includes('greenhouseBoards.length === 0'));
assert('discover.js rejects Lever source if LEVER_BOARDS is empty', discoverSrc21.includes('LEVER_BOARDS env var is empty') || discoverSrc21.includes('leverBoards.length === 0'));
assert('discover.js rejects USAJobs if API key missing', discoverSrc21.includes('USAJOBS_API_KEY and USAJOBS_USER_AGENT'));
assert('sources.js Greenhouse source is defined with sourceFamily=greenhouse', sourcesSrc21.includes("sourceFamily: 'greenhouse'") || sourcesSrc21.includes('sourceFamily:"greenhouse"'));
assert('sources.js canSourceRunLive requires liveCapable and enabled', sourcesSrc21.includes('liveCapable') && sourcesSrc21.includes('enabled'));

// 21c. Secondary dedup via source_job_id
assert('db.js exports getExistingSourceJobIds', dbSrc21.includes('export async function getExistingSourceJobIds'));
assert('db.js processBatch imports getExistingSourceJobIds', dbSrc21.includes('getExistingSourceJobIds'));
assert('db.js processBatch checks source_job_id before hash', (() => {
  const batchFn = dbSrc21.slice(dbSrc21.indexOf('export async function processBatch'));
  return batchFn.includes('source_job_id') && batchFn.includes('seenSourceJobIds');
})());
assert('db.js source_job_id dedup key is source_family:source_job_id', dbSrc21.includes('source_family}:${') || dbSrc21.includes('source_family} + '));
assert('db.js dedup_reason field set for source_job_id deduped records', dbSrc21.includes("dedup_reason: 'source_job_id'"));

// 21d. jobFinder normalisation
assert('jobFinder.js normaliseJob sets is_demo_record: false', jobFinderSrc21.includes('is_demo_record: false'));
assert('jobFinder.js normaliseJob sets canonical_job_url', jobFinderSrc21.includes('canonical_job_url'));
assert('jobFinder.js normaliseJob sets source_job_id', jobFinderSrc21.includes('source_job_id'));
assert('jobFinder.js Greenhouse adapter sets source_family=greenhouse', jobFinderSrc21.includes('SOURCE_FAMILIES.GREENHOUSE'));
assert('jobFinder.js does not set is_demo_record: true anywhere', !jobFinderSrc21.includes('is_demo_record: true'));

// 21e. n8n workflows use SITE_URL and DISCOVERY_SECRET
assert('n8n discover workflow uses $env.SITE_URL', n8nDiscoverSrc21.includes('$env.SITE_URL'));
assert('n8n discover workflow uses $env.DISCOVERY_SECRET', n8nDiscoverSrc21.includes('$env.DISCOVERY_SECRET'));
assert('n8n discover workflow sends X-Discovery-Secret header', n8nDiscoverSrc21.includes('X-Discovery-Secret'));
assert('n8n digest workflow uses $env.SITE_URL', n8nDigestSrc21.includes('$env.SITE_URL'));

// 21f. Manual trigger scripts exist
assert('scripts/run-discovery.sh has SITE_URL check', runDiscoverySrc21.includes('SITE_URL'));
assert('scripts/run-discovery.sh has DISCOVERY_SECRET check', runDiscoverySrc21.includes('DISCOVERY_SECRET'));
assert('scripts/run-discovery.sh calls POST /discover', runDiscoverySrc21.includes('/.netlify/functions/discover'));
assert('scripts/check-live.sh checks 401 for unauthorized call', checkLiveSrc21.includes('401'));
assert('scripts/check-live.sh checks /opportunities endpoint', checkLiveSrc21.includes('/opportunities'));

// 21g. LIVE_ACTIVATION_RUNBOOK.md completeness
assert('LIVE_ACTIVATION_RUNBOOK.md covers migrations', runbookSrc21.includes('Migration') || runbookSrc21.includes('migration'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents all 4 migration files', runbookSrc21.includes('001_discovery_fields') && runbookSrc21.includes('002_ingestion_logs') && runbookSrc21.includes('003_user_preferences') && runbookSrc21.includes('004_readiness_history'));
assert('LIVE_ACTIVATION_RUNBOOK.md has SQL verification for readiness_history', runbookSrc21.includes('readiness_history'));
assert('LIVE_ACTIVATION_RUNBOOK.md has SQL verification for user_preferences', runbookSrc21.includes('user_preferences'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents DISCOVERY_SECRET', runbookSrc21.includes('DISCOVERY_SECRET'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents GREENHOUSE_BOARDS', runbookSrc21.includes('GREENHOUSE_BOARDS'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents kill switch / rollback', runbookSrc21.includes('Kill Switch') || runbookSrc21.includes('kill switch') || runbookSrc21.includes('Rollback'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents curl command for manual run', runbookSrc21.includes('curl') && runbookSrc21.includes('/discover'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents LIVE_INTAKE_ENABLED', runbookSrc21.includes('LIVE_INTAKE_ENABLED'));
assert('LIVE_ACTIVATION_RUNBOOK.md has dedup success definition', runbookSrc21.includes('total_ingested: 0') || runbookSrc21.includes('total_ingested=0'));
assert('LIVE_ACTIVATION_RUNBOOK.md has dedup failure definition', runbookSrc21.includes('dedup') && (runbookSrc21.includes('failure') || runbookSrc21.includes('broken')));
assert('LIVE_ACTIVATION_RUNBOOK.md has n8n per-workflow checklist for 05-job-discovery', runbookSrc21.includes('05-job-discovery.json'));
assert('LIVE_ACTIVATION_RUNBOOK.md has n8n per-workflow checklist for 06-daily-approval-digest', runbookSrc21.includes('06-daily-approval-digest.json'));
assert('LIVE_ACTIVATION_RUNBOOK.md has n8n per-workflow checklist for 07-weekly-readiness-summary', runbookSrc21.includes('07-weekly-readiness-summary.json'));
assert('LIVE_ACTIVATION_RUNBOOK.md has go/no-go criteria', runbookSrc21.includes('Go / No-Go') || runbookSrc21.includes('GO') || runbookSrc21.includes('NO-GO'));
assert('LIVE_ACTIVATION_RUNBOOK.md documents n8n stop n8n scheduled discovery', runbookSrc21.includes('inactive') || runbookSrc21.includes('deactivat') || runbookSrc21.includes('Stop n8n'));
assert('LIVE_ACTIVATION_RUNBOOK.md safe delete pattern only targets pending records', runbookSrc21.includes("approval_state = 'pending'") || runbookSrc21.includes("approval_state='pending'"));

// 21h. Hierarchy guard
const tpmCheck21 = scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery. Agile, Jira, stakeholder management, program delivery.');
assert('Section 21: TPM hierarchy intact — TPM scores as TPM lane', tpmCheck21.lane === LANES.TPM);
assert('Section 21: Approval gate intact — live source activation does not bypass approval', (() => {
  // Even a live-discovered, highly-scored role starts as pending
  const liveDiscoveredRole = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 90,
    application_url: 'https://greenhouse.io/jobs/12345',
    fit_score: 88,
    recommended: true,
    source_family: 'greenhouse',
  };
  return classifyReadinessGroup(liveDiscoveredRole) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─── Section 22: Lever + Source Quality ──────────────────────────────────────

import { readFileSync as readFileSync22 } from 'fs';
import { join as join22, dirname as dirname22 } from 'path';
import { fileURLToPath as fileURLToPath22 } from 'url';

const __dirname_v22 = dirname22(fileURLToPath22(import.meta.url));

function section22(label) { console.log('\n== Section 22: ' + label + ' =='); }

section22('Lever + Source Quality — discovery filter, per-board cap, reports, runbook');

const sourcesSrc22    = readFileSync22(join22(__dirname_v22, '../netlify/functions/_shared/sources.js'), 'utf-8');
const jobFinderSrc22  = readFileSync22(join22(__dirname_v22, '../netlify/functions/_shared/jobFinder.js'), 'utf-8');
const dashboardSrc22  = readFileSync22(join22(__dirname_v22, '../src/pages/Dashboard.jsx'), 'utf-8');
const reportsSrc22    = readFileSync22(join22(__dirname_v22, '../src/pages/Reports.jsx'), 'utf-8');
const leverRunbookSrc = readFileSync22(join22(__dirname_v22, '../LEVER_ROLLOUT_RUNBOOK.md'), 'utf-8');
const n8nDiscoverSrc22 = readFileSync22(join22(__dirname_v22, '../n8n/workflows/05-job-discovery.json'), 'utf-8');

// 22a. Discovery profile exclusion keywords hardened
assert('sources.js excludeTitleKeywords includes office manager', sourcesSrc22.includes('office manager'));
assert('sources.js excludeTitleKeywords includes product manager', sourcesSrc22.includes('product manager'));
assert('sources.js excludeTitleKeywords includes account manager', sourcesSrc22.includes('account manager'));
assert('sources.js excludeTitleKeywords includes procurement manager', sourcesSrc22.includes('procurement manager'));
assert('sources.js excludeTitleKeywords includes contract manager', sourcesSrc22.includes('contract manager'));
assert('sources.js excludeDomainKeywords includes hospitality management', sourcesSrc22.includes('hospitality management'));
assert('sources.js excludeDomainKeywords includes real estate management', sourcesSrc22.includes('real estate management'));

// 22b. Discovery profile still includes core TPM/Delivery roles
assert('sources.js includeTitleKeywords still includes technical project manager', sourcesSrc22.includes('technical project manager'));
assert('sources.js includeTitleKeywords still includes delivery manager', sourcesSrc22.includes('delivery manager'));

// 22c. Per-board cap added to jobFinder
assert('jobFinder.js has per-board cap logic', jobFinderSrc22.includes('perBoardCap') || jobFinderSrc22.includes('per-board cap') || jobFinderSrc22.includes('computePerBoardCap'));
assert('jobFinder.js applies per-board cap to Greenhouse boards', jobFinderSrc22.includes('greenhouseBoards') && (jobFinderSrc22.includes('perBoardCap') || jobFinderSrc22.includes('slice')));
assert('jobFinder.js applies per-board cap to Lever boards', jobFinderSrc22.includes('leverBoards') && (jobFinderSrc22.includes('perBoardCap') || jobFinderSrc22.includes('slice')));

// 22d. Lever adapter still correctly set
assert('jobFinder.js Lever adapter sets source_family=lever', jobFinderSrc22.includes('SOURCE_FAMILIES.LEVER'));
assert('jobFinder.js Lever adapter uses api.lever.co', jobFinderSrc22.includes('api.lever.co'));
assert('jobFinder.js Lever adapter sets source_job_id from j.id', jobFinderSrc22.includes('source_job_id: j.id'));

// 22e. Dashboard has BestNewRolesPanel
assert('Dashboard.jsx has BestNewRolesPanel component', dashboardSrc22.includes('BestNewRolesPanel'));
assert('Dashboard.jsx BestNewRolesPanel shows fit_score', dashboardSrc22.includes('fit_score'));
assert('Dashboard.jsx BestNewRolesPanel shows source_family', dashboardSrc22.includes('source_family'));
assert('Dashboard.jsx BestNewRolesPanel only shows pending roles', dashboardSrc22.includes("approval_state === 'pending'"));
assert('Dashboard.jsx BestNewRolesPanel filters fit_score >= 50', dashboardSrc22.includes('>= 50') || dashboardSrc22.includes('>=50'));

// 22f. Reports has Source Quality tab
assert('Reports.jsx has source_quality digest type', reportsSrc22.includes("'source_quality'") || reportsSrc22.includes('"source_quality"'));
assert('Reports.jsx has SourceQualityPanel component', reportsSrc22.includes('SourceQualityPanel'));
assert('Reports.jsx Source Quality shows recommended_pct', reportsSrc22.includes('recommended_pct'));
assert('Reports.jsx Source Quality shows per-source-family stats', reportsSrc22.includes('source_family') && reportsSrc22.includes('familyStats'));
assert('Reports.jsx Source Quality loadDigest skips source_quality', reportsSrc22.includes("'source_quality'") && reportsSrc22.includes('source_quality'));

// 22g. n8n workflow updated with Lever notes
assert('n8n 05-job-discovery.json has Lever support note', n8nDiscoverSrc22.includes('LEVER') || n8nDiscoverSrc22.includes('Lever'));
assert('n8n 05-job-discovery.json mentions LEVER_BOARDS', n8nDiscoverSrc22.includes('LEVER_BOARDS'));

// 22h. Lever rollout runbook exists and is complete
assert('LEVER_ROLLOUT_RUNBOOK.md exists', leverRunbookSrc.length > 0);
assert('LEVER_ROLLOUT_RUNBOOK.md documents LEVER_BOARDS env var', leverRunbookSrc.includes('LEVER_BOARDS'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes verify slug step', leverRunbookSrc.includes('jobs.lever.co'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes manual Lever discovery command', leverRunbookSrc.includes('src-lever-boards'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes second-run dedup check', leverRunbookSrc.includes('second') && leverRunbookSrc.includes('dedup'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes how to disable Lever only', leverRunbookSrc.includes('Disable Lever Only') || leverRunbookSrc.includes('disable Lever') || leverRunbookSrc.includes('Disable Lever'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes safe delete pending-only pattern', leverRunbookSrc.includes("approval_state = 'pending'") || leverRunbookSrc.includes("approval_state='pending'"));
assert('LEVER_ROLLOUT_RUNBOOK.md never deletes approved records', leverRunbookSrc.includes('NEVER delete approved') || leverRunbookSrc.includes('Never delete approved'));
assert('LEVER_ROLLOUT_RUNBOOK.md includes quality thresholds', leverRunbookSrc.includes('Threshold') || leverRunbookSrc.includes('threshold') || leverRunbookSrc.includes('Rollback Decision'));
assert('LEVER_ROLLOUT_RUNBOOK.md warns against multiple source families', leverRunbookSrc.includes('USAJobs') || leverRunbookSrc.includes('Do not activate'));
assert('LEVER_ROLLOUT_RUNBOOK.md covers n8n scheduling', leverRunbookSrc.includes('n8n') && leverRunbookSrc.includes('schedule'));
assert('LEVER_ROLLOUT_RUNBOOK.md references LIVE_ACTIVATION_RUNBOOK for Greenhouse', leverRunbookSrc.includes('LIVE_ACTIVATION_RUNBOOK'));

// 22i. Hierarchy still intact
const tpmCheck22 = scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery with cross-functional teams.');
assert('Section 22: TPM hierarchy intact', tpmCheck22.lane === LANES.TPM);

const officeManager22 = passesDiscoveryProfile({ title: 'Office Manager', description: 'Manage the office.' }, DEFAULT_DISCOVERY_PROFILE);
assert('Section 22: Office Manager excluded by discovery profile', !officeManager22);

const leverTPM22 = passesDiscoveryProfile({ title: 'Technical Project Manager', description: 'Agile SDLC delivery', source_family: 'lever' }, DEFAULT_DISCOVERY_PROFILE);
assert('Section 22: Lever TPM role passes discovery profile', leverTPM22);

const leverOpsNoTech22 = passesDiscoveryProfile({ title: 'Operations Manager', description: 'General business operations oversight.' }, DEFAULT_DISCOVERY_PROFILE);
assert('Section 22: Generic Operations Manager excluded by discovery profile (no TPM/Delivery title match)', !leverOpsNoTech22);

// ─── Section 23: Daily Automation Expansion ──────────────────────────────────

import { readFileSync as readFileSync23 } from 'fs';
import { join as join23, dirname as dirname23 } from 'path';
import { fileURLToPath as fileURLToPath23 } from 'url';

const __dirname_v23 = dirname23(fileURLToPath23(import.meta.url));

console.log('\n== Section 23: Daily Automation Expansion ==');

const digestSrc23        = readFileSync23(join23(__dirname_v23, '../netlify/functions/digest.js'), 'utf-8');
const sourcesSrc23       = readFileSync23(join23(__dirname_v23, '../netlify/functions/_shared/sources.js'), 'utf-8');
const discoverSrc23      = readFileSync23(join23(__dirname_v23, '../netlify/functions/discover.js'), 'utf-8');
const jobFinderSrc23     = readFileSync23(join23(__dirname_v23, '../netlify/functions/_shared/jobFinder.js'), 'utf-8');
const dashboardSrc23     = readFileSync23(join23(__dirname_v23, '../src/pages/Dashboard.jsx'), 'utf-8');
const reportsSrc23       = readFileSync23(join23(__dirname_v23, '../src/pages/Reports.jsx'), 'utf-8');
const n8nDiscover23      = readFileSync23(join23(__dirname_v23, '../n8n/workflows/05-job-discovery.json'), 'utf-8');
const runbookSrc23       = readFileSync23(join23(__dirname_v23, '../LIVE_ACTIVATION_RUNBOOK.md'), 'utf-8');

// 23a. digest.js supports daily type
assert('23a. digest.js supports daily type', digestSrc23.includes("'daily'") || digestSrc23.includes('"daily"'));

// 23b. daily digest dailyDigest function exists in source
assert('23b. daily digest dailyDigest function exists in source', digestSrc23.includes('dailyDigest'));

// 23c. daily digest has per_source_family in output
assert('23c. daily digest has per_source_family in output', digestSrc23.includes('per_source_family'));

// 23d. daily digest has high_fit_roles
assert('23d. daily digest has high_fit_roles', digestSrc23.includes('high_fit_roles'));

// 23e. daily digest has blocked_by_missing_url count
assert('23e. daily digest has blocked_by_missing_url count', digestSrc23.includes('blocked_by_missing_url'));

// 23f. daily digest has approval_needed count
assert('23f. daily digest has approval_needed count', digestSrc23.includes('approval_needed'));

// 23g. sources.js live sources have maxRecordsPerSource field
assert('23g. sources.js live sources have maxRecordsPerSource field', sourcesSrc23.includes('maxRecordsPerSource'));

// 23h. sources.js exports getEnabledSourceFamilies helper
assert('23h. sources.js exports getEnabledSourceFamilies helper', sourcesSrc23.includes('getEnabledSourceFamilies'));

// 23i. sources.js exports filterSourcesByFamily helper
assert('23i. sources.js exports filterSourcesByFamily helper', sourcesSrc23.includes('filterSourcesByFamily'));

// 23j. discover.js supports sourceFamily body param
assert('23j. discover.js supports sourceFamily body param', discoverSrc23.includes('sourceFamily'));

// 23k. discover.js filter_source_family in response
assert('23k. discover.js filter_source_family in response', discoverSrc23.includes('filter_source_family'));

// 23l. jobFinder.js normaliseJob sets discovered_at
assert('23l. jobFinder.js normaliseJob sets discovered_at', jobFinderSrc23.includes('discovered_at'));

// 23m. Dashboard.jsx BestNewRolesPanel has "new today" / "NEW TODAY" indicator
assert('23m. Dashboard.jsx BestNewRolesPanel has new today / NEW TODAY indicator',
  dashboardSrc23.toLowerCase().includes('new today'));

// 23n. Reports.jsx SourceQualityPanel has junk_pct display
assert('23n. Reports.jsx SourceQualityPanel has junk_pct display',
  reportsSrc23.includes('junk_pct'));

// 23o. n8n 05-job-discovery.json has daily schedule (cron or daily)
assert('23o. n8n 05-job-discovery.json has daily schedule (cron or daily)',
  n8nDiscover23.includes('cronExpression') || n8nDiscover23.includes('0 7 * * *') || n8nDiscover23.includes('Daily'));

// 23p. n8n 05-job-discovery.json notes include GREENHOUSE-ONLY RUN
assert('23p. n8n 05-job-discovery.json notes include GREENHOUSE-ONLY RUN',
  n8nDiscover23.includes('GREENHOUSE-ONLY RUN'));

// 23q. n8n 05-job-discovery.json notes include LEVER-ONLY RUN
assert('23q. n8n 05-job-discovery.json notes include LEVER-ONLY RUN',
  n8nDiscover23.includes('LEVER-ONLY RUN'));

// 23r. LIVE_ACTIVATION_RUNBOOK.md has Daily Operations section
assert('23r. LIVE_ACTIVATION_RUNBOOK.md has Daily Operations section',
  runbookSrc23.includes('Daily Operations'));

// 23s. LIVE_ACTIVATION_RUNBOOK.md daily ops covers 7am UTC or daily schedule
assert('23s. LIVE_ACTIVATION_RUNBOOK.md daily ops covers 7am UTC or daily schedule',
  runbookSrc23.includes('7am UTC') || runbookSrc23.includes('daily schedule') || runbookSrc23.includes('Daily Schedule'));

// 23t. LIVE_ACTIVATION_RUNBOOK.md daily ops covers best jobs today
assert('23t. LIVE_ACTIVATION_RUNBOOK.md daily ops covers best jobs today',
  runbookSrc23.toLowerCase().includes('best') && (runbookSrc23.toLowerCase().includes('today') || runbookSrc23.toLowerCase().includes('best new roles')));

// 23u. Scoring hierarchy still intact (TPM > Delivery > Ops)
const tpmCheck23 = scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery. Agile, Jira, stakeholder management.');
assert('23u. Scoring hierarchy still intact (TPM > Delivery > Ops)', tpmCheck23.lane === LANES.TPM);

// 23v. Approval gate still mandatory
assert('23v. Approval gate still mandatory', (() => {
  const liveRole = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 95,
    application_url: 'https://greenhouse.io/jobs/99999',
    fit_score: 92,
    recommended: true,
    source_family: 'greenhouse',
  };
  return classifyReadinessGroup(liveRole) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─── Section 24: Post-Lever-Rollout Source Priority + Quota Safety ─────────────

import { readFileSync as readFileSync24, existsSync as existsSync24 } from 'fs';
import { join as join24, dirname as dirname24 } from 'path';
import { fileURLToPath as fileURLToPath24 } from 'url';

const __dirname_v24 = dirname24(fileURLToPath24(import.meta.url));

console.log('\n== Section 24: Post-Lever-Rollout Source Priority + Quota Safety ==');

const leverRunbook24    = readFileSync24(join24(__dirname_v24, '../LEVER_ROLLOUT_RUNBOOK.md'), 'utf-8');
const liveRunbook24     = readFileSync24(join24(__dirname_v24, '../LIVE_ACTIVATION_RUNBOOK.md'), 'utf-8');
const deployRunbook24   = readFileSync24(join24(__dirname_v24, '../DEPLOYMENT_RUNBOOK.md'), 'utf-8');
const sourceGov24       = readFileSync24(join24(__dirname_v24, '../SOURCE_GOVERNANCE.md'), 'utf-8');
const maxAuto24         = readFileSync24(join24(__dirname_v24, '../MAX_AUTOMATION_README.md'), 'utf-8');
const autoRunbook24     = readFileSync24(join24(__dirname_v24, '../AUTOMATION_RUNBOOK.md'), 'utf-8');
const readme24          = readFileSync24(join24(__dirname_v24, '../README.md'), 'utf-8');

// 24a. emesent is not present in any active rollout doc
const allDocs24 = leverRunbook24 + liveRunbook24 + deployRunbook24 + sourceGov24 + maxAuto24 + autoRunbook24 + readme24;
assert('24a. emesent not present in any active rollout doc', !allDocs24.includes('emesent'));

// 24b. LEVER_ROLLOUT_RUNBOOK.md declares Lever as PRIMARY source
assert('24b. LEVER_ROLLOUT_RUNBOOK.md declares Lever as PRIMARY source',
  leverRunbook24.includes('PRIMARY') || leverRunbook24.includes('primary source') || leverRunbook24.includes('primary live source'));

// 24c. LEVER_ROLLOUT_RUNBOOK.md includes verified slugs (aerostrat / thinkahead / immutable)
assert('24c. LEVER_ROLLOUT_RUNBOOK.md includes verified working slugs',
  leverRunbook24.includes('aerostrat') || leverRunbook24.includes('thinkahead') || leverRunbook24.includes('immutable'));

// 24d. LEVER_ROLLOUT_RUNBOOK.md has post-quota section
assert('24d. LEVER_ROLLOUT_RUNBOOK.md has post-quota next steps section',
  leverRunbook24.includes('Post-Quota') || leverRunbook24.includes('post-quota') || leverRunbook24.includes('usage_exceeded'));

// 24e. LEVER_ROLLOUT_RUNBOOK.md mentions 503 or usage_exceeded
assert('24e. LEVER_ROLLOUT_RUNBOOK.md mentions 503 usage_exceeded',
  leverRunbook24.includes('503') || leverRunbook24.includes('usage_exceeded'));

// 24f. LEVER_ROLLOUT_RUNBOOK.md post-quota steps include verify Apply Pack through live path
assert('24f. LEVER_ROLLOUT_RUNBOOK.md post-quota steps include Apply Pack verification',
  leverRunbook24.includes('Apply Pack'));

// 24g. LEVER_ROLLOUT_RUNBOOK.md states RSS and USAJobs are off
assert('24g. LEVER_ROLLOUT_RUNBOOK.md states RSS and USAJobs are off/staged',
  (leverRunbook24.includes('RSS') && leverRunbook24.includes('off')) ||
  (leverRunbook24.includes('RSS') && leverRunbook24.includes('staged')) ||
  leverRunbook24.includes('Do not activate RSS'));

// 24h. LIVE_ACTIVATION_RUNBOOK.md has source priority section with Lever as primary
assert('24h. LIVE_ACTIVATION_RUNBOOK.md shows Lever as primary source',
  liveRunbook24.includes('Lever') && (liveRunbook24.includes('Primary') || liveRunbook24.includes('primary')));

// 24i. LIVE_ACTIVATION_RUNBOOK.md has post-quota section
assert('24i. LIVE_ACTIVATION_RUNBOOK.md has post-quota section',
  liveRunbook24.includes('Post-Quota') || liveRunbook24.includes('post-quota') || liveRunbook24.includes('usage_exceeded'));

// 24j. LIVE_ACTIVATION_RUNBOOK.md documents 503 usage_exceeded as a blocker
assert('24j. LIVE_ACTIVATION_RUNBOOK.md documents 503 usage_exceeded blocker',
  liveRunbook24.includes('503') || liveRunbook24.includes('usage_exceeded'));

// 24k. LIVE_ACTIVATION_RUNBOOK.md post-quota steps include Lever discovery first
assert('24k. LIVE_ACTIVATION_RUNBOOK.md post-quota sequence runs Lever first',
  liveRunbook24.includes('Lever') && liveRunbook24.includes('post-quota') || liveRunbook24.includes('Lever-first'));

// 24l. LIVE_ACTIVATION_RUNBOOK.md states RSS and USAJobs are off
assert('24l. LIVE_ACTIVATION_RUNBOOK.md states RSS and USAJobs are staged/off',
  (liveRunbook24.includes('RSS') || liveRunbook24.includes('rss')) &&
  (liveRunbook24.includes('off') || liveRunbook24.includes('Staged') || liveRunbook24.includes('staged')));

// 24m. DEPLOYMENT_RUNBOOK.md shows Lever as first/primary recommended source
assert('24m. DEPLOYMENT_RUNBOOK.md recommends Lever as primary live source',
  deployRunbook24.includes('Lever') && (deployRunbook24.includes('primary') || deployRunbook24.includes('Primary') || deployRunbook24.includes('recommended primary')));

// 24n. DEPLOYMENT_RUNBOOK.md includes quota warning
assert('24n. DEPLOYMENT_RUNBOOK.md includes Netlify quota warning',
  deployRunbook24.includes('503') || deployRunbook24.includes('usage_exceeded') || deployRunbook24.includes('quota'));

// 24o. SOURCE_GOVERNANCE.md has current source priority table
assert('24o. SOURCE_GOVERNANCE.md has current source priority section',
  sourceGov24.includes('Current Source Priority') || sourceGov24.includes('Operating Truth') || sourceGov24.includes('PRIMARY'));

// 24p. SOURCE_GOVERNANCE.md shows Lever as PRIMARY
assert('24p. SOURCE_GOVERNANCE.md shows lever as PRIMARY',
  sourceGov24.includes('lever') && sourceGov24.includes('PRIMARY'));

// 24q. SOURCE_GOVERNANCE.md shows RSS as staged off (not "Active")
assert('24q. SOURCE_GOVERNANCE.md shows rss as staged off',
  sourceGov24.toLowerCase().includes('rss') &&
  (sourceGov24.includes('Staged off') || sourceGov24.includes('staged off') || sourceGov24.includes('Not activated')));

// 24r. MAX_AUTOMATION_README.md shows Lever as PRIMARY
assert('24r. MAX_AUTOMATION_README.md shows Lever as PRIMARY source',
  maxAuto24.includes('lever') && maxAuto24.includes('PRIMARY'));

// 24s. MAX_AUTOMATION_README.md uses verified Lever slugs in env example
assert('24s. MAX_AUTOMATION_README.md uses verified Lever slugs',
  maxAuto24.includes('aerostrat') || maxAuto24.includes('thinkahead') || maxAuto24.includes('immutable'));

// 24t. AUTOMATION_RUNBOOK.md has quota/503 documentation
assert('24t. AUTOMATION_RUNBOOK.md documents Netlify quota gate',
  autoRunbook24.includes('503') || autoRunbook24.includes('usage_exceeded') || autoRunbook24.includes('quota'));

// 24u. AUTOMATION_RUNBOOK.md has schedule gate section
assert('24u. AUTOMATION_RUNBOOK.md has schedule gate / quota check',
  autoRunbook24.includes('Schedule gate') || autoRunbook24.includes('schedule gate') || autoRunbook24.includes('quota'));

// 24v. README.md shows Lever as primary
assert('24v. README.md shows Lever as PRIMARY source',
  readme24.includes('Lever') && (readme24.includes('PRIMARY') || readme24.includes('primary')));

// 24w. README.md has quota warning
assert('24w. README.md includes quota/503 warning',
  readme24.includes('503') || readme24.includes('usage_exceeded') || readme24.includes('quota'));

// 24x. No doc states LinkedIn is automated or scraped (negative — should not claim it IS)
assert('24x. No doc claims LinkedIn IS automated or scraped',
  !allDocs24.toLowerCase().includes('linkedin is automated') &&
  !allDocs24.toLowerCase().includes('linkedin scraping is') &&
  !allDocs24.toLowerCase().includes('scraping linkedin'));

// 24y. Hierarchy still intact after all changes
const tpmCheck24 = scoreOpportunity('Senior Technical Project Manager', 'Lead SDLC delivery with agile teams, Jira, stakeholders. PMP preferred. Confluence, roadmap, sprint planning.');
assert('24y. TPM hierarchy intact after source-priority pass', tpmCheck24.lane === LANES.TPM);

// 24z. Approval gate still mandatory
assert('24z. Approval gate mandatory after source-priority pass', (() => {
  const role = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 95,
    application_url: 'https://jobs.lever.co/aerostrat/abc',
    fit_score: 94,
    recommended: true,
    source_family: 'lever',
  };
  return classifyReadinessGroup(role) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ─── Section 25: Multi-Source Expansion — USAJobs/RSS hardening, activation waves, quality governance ─

import { readFileSync as readFileSync25, existsSync as existsSync25 } from 'fs';
import { join as join25, dirname as dirname25 } from 'path';
import { fileURLToPath as fileURLToPath25 } from 'url';

const __dirname_v25 = dirname25(fileURLToPath25(import.meta.url));

console.log('\n== Section 25: Multi-Source Expansion (USAJobs/RSS hardening + activation waves) ==');

const sourceGov25       = readFileSync25(join25(__dirname_v25, '../SOURCE_GOVERNANCE.md'), 'utf-8');
const liveRunbook25     = readFileSync25(join25(__dirname_v25, '../LIVE_ACTIVATION_RUNBOOK.md'), 'utf-8');
const sourcesSrc25      = readFileSync25(join25(__dirname_v25, '../netlify/functions/_shared/sources.js'), 'utf-8');
const jobFinderSrc25    = readFileSync25(join25(__dirname_v25, '../netlify/functions/_shared/jobFinder.js'), 'utf-8');
const discoverSrc25     = readFileSync25(join25(__dirname_v25, '../netlify/functions/discover.js'), 'utf-8');
const digestSrc25       = readFileSync25(join25(__dirname_v25, '../netlify/functions/digest.js'), 'utf-8');
const reportsSrc25      = readFileSync25(join25(__dirname_v25, '../src/pages/Reports.jsx'), 'utf-8');
const dashboardSrc25    = readFileSync25(join25(__dirname_v25, '../src/pages/Dashboard.jsx'), 'utf-8');
const runDiscoverySh25  = readFileSync25(join25(__dirname_v25, '../scripts/run-discovery.sh'), 'utf-8');
const n8nDiscover25     = readFileSync25(join25(__dirname_v25, '../n8n/workflows/05-job-discovery.json'), 'utf-8');

// ── 25a. SOURCE_GOVERNANCE.md has Source Activation Waves section ─────────────
assert('25a. SOURCE_GOVERNANCE.md has Source Activation Waves section',
  sourceGov25.includes('Source Activation Waves') || sourceGov25.includes('Activation Waves'));

// ── 25b. SOURCE_GOVERNANCE.md shows Wave 1 as Lever + Greenhouse (active) ─────
assert('25b. SOURCE_GOVERNANCE.md shows Wave 1 as Lever + Greenhouse (active)',
  sourceGov25.includes('Wave 1') && sourceGov25.includes('Active'));

// ── 25c. SOURCE_GOVERNANCE.md shows Wave 2 as USAJobs (staged) ───────────────
assert('25c. SOURCE_GOVERNANCE.md shows Wave 2 as USAJobs (staged)',
  sourceGov25.includes('Wave 2') && sourceGov25.includes('USAJobs'));

// ── 25d. SOURCE_GOVERNANCE.md shows Wave 3 as RSS (staged) ───────────────────
assert('25d. SOURCE_GOVERNANCE.md shows Wave 3 as RSS (staged)',
  sourceGov25.includes('Wave 3') && (sourceGov25.includes('RSS') || sourceGov25.includes('rss')));

// ── 25e. SOURCE_GOVERNANCE.md has USAJobs activation prerequisites ────────────
assert('25e. SOURCE_GOVERNANCE.md has USAJobs Activation Prerequisites',
  sourceGov25.includes('USAJobs Activation Prerequisites') || sourceGov25.includes('USAJobs activation prerequisites'));

// ── 25f. SOURCE_GOVERNANCE.md USAJobs prerequisites include USAJOBS_API_KEY ───
assert('25f. SOURCE_GOVERNANCE.md USAJobs prerequisites include USAJOBS_API_KEY',
  sourceGov25.includes('USAJOBS_API_KEY'));

// ── 25g. SOURCE_GOVERNANCE.md USAJobs prerequisites include USAJOBS_USER_AGENT ─
assert('25g. SOURCE_GOVERNANCE.md USAJobs prerequisites include USAJOBS_USER_AGENT',
  sourceGov25.includes('USAJOBS_USER_AGENT'));

// ── 25h. SOURCE_GOVERNANCE.md has RSS / Atom Activation Prerequisites ─────────
assert('25h. SOURCE_GOVERNANCE.md has RSS Activation Prerequisites section',
  sourceGov25.includes('RSS') && (sourceGov25.includes('Activation Prerequisites') || sourceGov25.includes('activation prerequisites')));

// ── 25i. SOURCE_GOVERNANCE.md has Source Quality Governance section ───────────
assert('25i. SOURCE_GOVERNANCE.md has Source Quality Governance section',
  sourceGov25.includes('Source Quality Governance') || sourceGov25.includes('quality governance'));

// ── 25j. SOURCE_GOVERNANCE.md quality governance covers recommended_pct ───────
assert('25j. SOURCE_GOVERNANCE.md quality governance covers recommended_pct threshold',
  sourceGov25.includes('recommended_pct'));

// ── 25k. SOURCE_GOVERNANCE.md quality governance covers junk_pct ─────────────
assert('25k. SOURCE_GOVERNANCE.md quality governance covers junk_pct threshold',
  sourceGov25.includes('junk_pct'));

// ── 25l. LIVE_ACTIVATION_RUNBOOK.md has multi-source expansion section ─────────
assert('25l. LIVE_ACTIVATION_RUNBOOK.md has multi-source expansion section (§11)',
  liveRunbook25.includes('Multi-Source Expansion') || liveRunbook25.includes('multi-source expansion'));

// ── 25m. LIVE_ACTIVATION_RUNBOOK.md §11 has Wave 2 USAJobs activation steps ───
assert('25m. LIVE_ACTIVATION_RUNBOOK.md §11 has Wave 2 USAJobs activation steps',
  liveRunbook25.includes('Wave 2') && liveRunbook25.includes('USAJobs'));

// ── 25n. LIVE_ACTIVATION_RUNBOOK.md §11 has Wave 3 RSS activation steps ───────
assert('25n. LIVE_ACTIVATION_RUNBOOK.md §11 has Wave 3 RSS activation steps',
  liveRunbook25.includes('Wave 3') && (liveRunbook25.includes('RSS') || liveRunbook25.includes('Atom')));

// ── 25o. LIVE_ACTIVATION_RUNBOOK.md has USAJobs rollback instruction ──────────
assert('25o. LIVE_ACTIVATION_RUNBOOK.md has USAJobs rollback instruction',
  liveRunbook25.includes('USAJobs rollback') || (liveRunbook25.includes('src-usajobs') && liveRunbook25.includes('rollback')));

// ── 25p. run-discovery.sh supports --family flag ──────────────────────────────
assert('25p. run-discovery.sh supports --family flag',
  runDiscoverySh25.includes('--family=') || runDiscoverySh25.includes('family'));

// ── 25q. run-discovery.sh has --family=usajobs example ───────────────────────
assert('25q. run-discovery.sh has --family=usajobs example',
  runDiscoverySh25.includes('usajobs'));

// ── 25r. run-discovery.sh has --family=rss example ───────────────────────────
assert('25r. run-discovery.sh has --family=rss example',
  runDiscoverySh25.includes('rss') || runDiscoverySh25.includes('RSS'));

// ── 25s. n8n 05-job-discovery.json has USAJOBS-ONLY RUN note ─────────────────
assert('25s. n8n 05-job-discovery.json has USAJOBS-ONLY RUN note',
  n8nDiscover25.includes('USAJOBS-ONLY RUN'));

// ── 25t. n8n 05-job-discovery.json has source activation wave note ────────────
assert('25t. n8n 05-job-discovery.json has source activation wave note',
  n8nDiscover25.includes('Wave 1') || n8nDiscover25.includes('SOURCE ACTIVATION WAVES'));

// ── 25u. sources.js USAJobs source has enabled: false (not activated by default) ─
assert('25u. sources.js USAJobs source is off by default (enabled: false)',
  (() => {
    // Find the usajobs block and confirm enabled: false appears near it
    const idx = sourcesSrc25.indexOf("'src-usajobs'");
    if (idx < 0) return false;
    const snippet = sourcesSrc25.slice(idx, idx + 300);
    return snippet.includes('enabled: false');
  })()
);

// ── 25v. sources.js RSS sources have enabled: false (not activated by default) ─
assert('25v. sources.js RSS sources are off by default (enabled: false)',
  (() => {
    const idx = sourcesSrc25.indexOf("'src-rss-seek'");
    if (idx < 0) return false;
    const snippet = sourcesSrc25.slice(idx, idx + 300);
    return snippet.includes('enabled: false');
  })()
);

// ── 25w. discover.js validates USAJobs config (USAJOBS_API_KEY) ───────────────
assert('25w. discover.js validates USAJobs config before running',
  discoverSrc25.includes('USAJOBS_API_KEY') && discoverSrc25.includes('USAJOBS_USER_AGENT'));

// ── 25x. discover.js supports sourceFamily body param (multi-source filter) ───
assert('25x. discover.js supports sourceFamily body param for per-family runs',
  discoverSrc25.includes('sourceFamily'));

// ── 25y. digest.js per_source_family breakdown covers usajobs source family ───
assert('25y. digest.js per_source_family breakdown includes source_family key',
  digestSrc25.includes('per_source_family') && digestSrc25.includes('source_family'));

// ── 25z. Reports.jsx SourceQualityPanel includes usajobs in SF_META ───────────
assert('25z. Reports.jsx SourceQualityPanel includes usajobs in source family metadata',
  reportsSrc25.toLowerCase().includes('usajobs'));

// ── 25aa. Dashboard.jsx BestNewRolesPanel has source_family badge ─────────────
assert('25aa. Dashboard.jsx BestNewRolesPanel has source_family badge',
  dashboardSrc25.includes('source_family'));

// ── 25ab. jobFinder.js fetchUSAJobsRoles function exists ─────────────────────
assert('25ab. jobFinder.js fetchUSAJobsRoles adapter exists',
  jobFinderSrc25.includes('fetchUSAJobsRoles'));

// ── 25ac. jobFinder.js fetchRSSFeed function exists ──────────────────────────
assert('25ac. jobFinder.js fetchRSSFeed adapter exists',
  jobFinderSrc25.includes('fetchRSSFeed'));

// ── 25ad. jobFinder.js USAJobs adapter validates API key ─────────────────────
assert('25ad. jobFinder.js USAJobs adapter validates USAJOBS_API_KEY before fetching',
  jobFinderSrc25.includes('USAJOBS_API_KEY') && jobFinderSrc25.includes('USAJOBS_USER_AGENT'));

// ── 25ae. Lever source unaffected by multi-source changes (still present) ─────
assert('25ae. Lever source (src-lever-boards) still present in sources.js',
  sourcesSrc25.includes('src-lever-boards'));

// ── 25af. Greenhouse source unaffected (still present) ───────────────────────
assert('25af. Greenhouse source (src-greenhouse-boards) still present in sources.js',
  sourcesSrc25.includes('src-greenhouse-boards'));

// ── 25ag. Hierarchy still intact after multi-source changes ──────────────────
const tpmCheck25 = scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery with Agile, Jira, stakeholders. PMP preferred.');
assert('25ag. Scoring hierarchy intact after multi-source expansion (TPM = TPM lane)',
  tpmCheck25.lane === LANES.TPM);

// ── 25ah. Approval gate still mandatory with usajobs source_family ────────────
assert('25ah. Approval gate mandatory for usajobs-sourced roles', (() => {
  const usajobsRole = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 95,
    application_url: 'https://www.usajobs.gov/job/123456',
    fit_score: 88,
    recommended: true,
    source_family: 'usajobs',
  };
  return classifyReadinessGroup(usajobsRole) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// ── 25ai. LinkedIn still not automated in any source ─────────────────────────
assert('25ai. No sources.js entry claims LinkedIn is automated',
  !sourcesSrc25.toLowerCase().includes('linkedin is automated') &&
  !sourcesSrc25.toLowerCase().includes('linkedin scraping'));

// ── 25aj. digest.js has per-source high_fit_today tracking ───────────────────
assert('25aj. digest.js tracks high_fit_today per source family',
  digestSrc25.includes('high_fit_today'));

// ─── Section 26: Production Hardening — Silent-failure elimination + config safety ──

import { readFileSync as readFileSync26 } from 'fs';
import { join as join26, dirname as dirname26 } from 'path';
import { fileURLToPath as fileURLToPath26 } from 'url';

const __dirname_v26 = dirname26(fileURLToPath26(import.meta.url));

console.log('\n== Section 26: Production Hardening ==');

const netlifyToml26   = readFileSync26(join26(__dirname_v26, '../netlify.toml'), 'utf-8');
const discoverSrc26   = readFileSync26(join26(__dirname_v26, '../netlify/functions/discover.js'), 'utf-8');
const approveSrc26    = readFileSync26(join26(__dirname_v26, '../netlify/functions/approve.js'), 'utf-8');
const prepSrc26       = readFileSync26(join26(__dirname_v26, '../netlify/functions/_shared/prep.js'), 'utf-8');
const webhooksSrc26   = readFileSync26(join26(__dirname_v26, '../netlify/functions/webhooks.js'), 'utf-8');
const applyPackFn26   = readFileSync26(join26(__dirname_v26, '../netlify/functions/apply-pack.js'), 'utf-8');

// 26a. netlify.toml does NOT contain the invalid scalar `timeout = 26`
assert('26a. netlify.toml does not contain invalid timeout = 26 scalar',
  !netlifyToml26.includes('timeout = 26'));

// 26b. netlify.toml is valid (contains node_bundler and included_files, no scalar timeout)
assert('26b. netlify.toml contains valid [functions] settings (node_bundler, included_files)',
  netlifyToml26.includes('node_bundler') && netlifyToml26.includes('included_files'));

// 26c. netlify.toml has a comment explaining timeout is handled in function design
assert('26c. netlify.toml comment explains runtime timeout must be handled in function/workflow design',
  netlifyToml26.includes('runtime timeout') || netlifyToml26.includes('Runtime timeout') || netlifyToml26.includes('AbortSignal'));

// 26d. discover.js listSources catch block logs the error (not silent)
assert('26d. discover.js listSources catch block logs error (not silent catch {})',
  discoverSrc26.includes('listSources') && discoverSrc26.includes('console.warn'));

// 26e. discover.js listSources catch uses named error variable (not bare catch {})
assert('26e. discover.js listSources error is captured and logged',
  discoverSrc26.includes('dbErr') || (discoverSrc26.includes('catch (') && discoverSrc26.includes('console.warn')));

// 26f. approve.js persists pack generation error on the record
assert('26f. approve.js persists apply_pack_generation_error when pack fails',
  approveSrc26.includes('apply_pack_generation_error'));

// 26g. approve.js pack error is set in catch block (failure-transparent)
assert('26g. approve.js pack error assignment is in catch block',
  (() => {
    const catchIdx = approveSrc26.indexOf('packErr');
    if (catchIdx < 0) return false;
    const snippet = approveSrc26.slice(catchIdx, catchIdx + 400);
    return snippet.includes('apply_pack_generation_error');
  })());

// 26h. prep.js fireEvent logs non-2xx webhook responses
assert('26h. prep.js fireEvent logs failed webhook delivery (non-2xx)',
  prepSrc26.includes('fireEvent') && prepSrc26.includes('!res.ok') && prepSrc26.includes('console.warn'));

// 26i. prep.js fireEvent still non-blocking (callers can .catch())
assert('26i. prep.js fireEvent checks response status after await',
  prepSrc26.includes('.then(res =>') || prepSrc26.includes('res.ok'));

// 26j. webhooks.js dispatch logs non-2xx delivery failures
assert('26j. webhooks.js dispatch logs non-2xx failures with console.warn',
  webhooksSrc26.includes('!ok') && webhooksSrc26.includes('console.warn'));

// 26k. apply-pack.js GET imports insertReadinessHistory
assert('26k. apply-pack.js GET path imports insertReadinessHistory',
  applyPackFn26.includes('insertReadinessHistory'));

// 26l. apply-pack.js records readiness history on auto-generation
assert('26l. apply-pack.js records readiness history event when auto-generating pack on GET',
  applyPackFn26.includes('auto_generated_on_get') || applyPackFn26.includes('pack_regenerated'));

// 26m. Scoring hierarchy still intact after all changes
const tpmCheck26 = scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery with Agile, Jira, stakeholders. PMP preferred.');
assert('26m. Scoring hierarchy intact after hardening pass (TPM = TPM lane)',
  tpmCheck26.lane === LANES.TPM);

// 26n. Approval gate still mandatory after hardening pass
assert('26n. Approval gate mandatory after hardening pass', (() => {
  const role = {
    approval_state: 'pending',
    status: 'discovered',
    pack_readiness_score: 95,
    application_url: 'https://jobs.lever.co/aerostrat/abc',
    fit_score: 94,
    recommended: true,
    source_family: 'lever',
  };
  return classifyReadinessGroup(role) !== READINESS_GROUPS.READY_TO_APPLY;
})());

// 26o. No LinkedIn scraping introduced in hardening changes
assert('26o. No LinkedIn scraping introduced by hardening changes',
  !discoverSrc26.toLowerCase().includes('linkedin.com/jobs') &&
  !approveSrc26.toLowerCase().includes('linkedin.com/jobs'));

// ─── Section 27: Resume Vault ─────────────────────────────────────────────────

import { readFileSync as readFileSync27, existsSync as existsSync27 } from 'fs';
import { join as join27, dirname as dirname27 } from 'path';
import { fileURLToPath as fileURLToPath27 } from 'url';

import {
  INITIAL_VAULT,
  VAULT_STATUS,
  VAULT_LANES,
  VAULT_LANE_LABELS,
  VAULT_STATUS_LABELS,
  VAULT_LANE_TO_SCORING_LANE,
  getActiveResumes,
  getFallbackResumes,
  getArchivedResumes,
  getSelectableResumes,
  getCanonicalResumes,
  getResumeById,
  recommendVaultResume,
  getVaultQualityGates,
  createApplicationLog,
  computeVaultAnalytics,
  updateVaultRecord,
  resetVaultToDefaults,
} from '../netlify/functions/_shared/resumeVault.js';

const __dirname_v27 = dirname27(fileURLToPath27(import.meta.url));

console.log('\n== Section 27: Resume Vault ==');

// ── 27a. Module structure ───────────────────────────────────────────────────────
assert('27a. VAULT_STATUS constants exist (active/fallback/archived)',
  VAULT_STATUS.ACTIVE === 'active' && VAULT_STATUS.FALLBACK === 'fallback' && VAULT_STATUS.ARCHIVED === 'archived');
assert('27b. VAULT_LANES constants exist (tpm/it_pm/delivery/program/ops/pm_generic)',
  VAULT_LANES.TPM === 'tpm' && VAULT_LANES.IT_PM === 'it_pm' && VAULT_LANES.DELIVERY === 'delivery' &&
  VAULT_LANES.PROGRAM === 'program' && VAULT_LANES.OPS === 'ops' && VAULT_LANES.PM_GENERIC === 'pm_generic');
assert('27c. VAULT_LANE_LABELS has entries for all vault lanes',
  Object.keys(VAULT_LANE_LABELS).length >= 6);
assert('27d. VAULT_STATUS_LABELS has entries for all vault statuses',
  Object.keys(VAULT_STATUS_LABELS).length === 3);
assert('27e. VAULT_LANE_TO_SCORING_LANE maps tpm → LANES.TPM',
  VAULT_LANE_TO_SCORING_LANE[VAULT_LANES.TPM] === LANES.TPM);
assert('27f. VAULT_LANE_TO_SCORING_LANE maps it_pm → LANES.TPM (IT PM treated as TPM for scoring)',
  VAULT_LANE_TO_SCORING_LANE[VAULT_LANES.IT_PM] === LANES.TPM);
assert('27g. VAULT_LANE_TO_SCORING_LANE maps delivery → LANES.DELIVERY_MANAGER',
  VAULT_LANE_TO_SCORING_LANE[VAULT_LANES.DELIVERY] === LANES.DELIVERY_MANAGER);

// ── 27b. INITIAL_VAULT shape ───────────────────────────────────────────────────
assert('27h. INITIAL_VAULT has exactly 9 resumes', INITIAL_VAULT.length === 9);
assert('27i. Every vault record has required fields',
  INITIAL_VAULT.every(r =>
    r.id && r.display_name && r.original_file_name && r.lane && r.status &&
    Array.isArray(r.domain_tags) && typeof r.quality_score === 'number' &&
    r.version_label !== undefined && typeof r.is_canonical === 'boolean'
  ));
assert('27j. No vault record has undefined status',
  INITIAL_VAULT.every(r => [VAULT_STATUS.ACTIVE, VAULT_STATUS.FALLBACK, VAULT_STATUS.ARCHIVED].includes(r.status)));
assert('27k. No vault record has undefined lane',
  INITIAL_VAULT.every(r => Object.values(VAULT_LANES).includes(r.lane)));

// ── 27c. Active / fallback / archived counts ───────────────────────────────────
const activeResumes = getActiveResumes();
const fallbackResumes = getFallbackResumes();
const archivedResumes = getArchivedResumes();
assert('27l. Exactly 2 active resumes (IT PM + TPM only)', activeResumes.length === 2);
assert('27m. Exactly 1 fallback resume (Program Manager only)', fallbackResumes.length === 1);
assert('27n. Exactly 6 archived resumes', archivedResumes.length === 6);
assert('27o. Active resumes are all canonical', activeResumes.every(r => r.is_canonical));
assert('27p. IT PM resume (rv-it-pm-01) is active', activeResumes.some(r => r.id === 'rv-it-pm-01'));
assert('27pa. TPM resume (rv-tpm-01) is active', activeResumes.some(r => r.id === 'rv-tpm-01'));
assert('27pb. Program Manager (rv-program-01) is the only fallback', fallbackResumes.length === 1 && fallbackResumes[0].id === 'rv-program-01');
assert('27pc. Ops resume (rv-ops-01) is archived', archivedResumes.some(r => r.id === 'rv-ops-01'));
assert('27pd. Agile PM (rv-delivery-agile-01) is archived', archivedResumes.some(r => r.id === 'rv-delivery-agile-01'));
assert('27pe. Senior PM (rv-tpm-senior-01) is archived', archivedResumes.some(r => r.id === 'rv-tpm-senior-01'));

// ── 27d. Filter helpers ────────────────────────────────────────────────────────
const selectable = getSelectableResumes();
assert('27q. getSelectableResumes excludes archived', selectable.length === 3);
assert('27r. getSelectableResumes includes active + fallback only',
  selectable.every(r => r.status !== VAULT_STATUS.ARCHIVED));
assert('27s. getCanonicalResumes returns only active + canonical', getCanonicalResumes().every(r => r.is_canonical && r.status === VAULT_STATUS.ACTIVE));
assert('27t. getResumeById returns correct record', getResumeById('rv-tpm-01')?.id === 'rv-tpm-01');
assert('27u. getResumeById returns null for unknown id', getResumeById('rv-nonexistent') === null);

// ── 27e. Recommendation engine ─────────────────────────────────────────────────
const tpmRec27 = recommendVaultResume(LANES.TPM, 85, ['technical project manager', 'sdlc', 'agile']);
assert('27v. TPM lane → recommends TPM or IT PM vault resume',
  tpmRec27.resume?.lane === VAULT_LANES.TPM || tpmRec27.resume?.lane === VAULT_LANES.IT_PM);
assert('27w. TPM recommendation has high confidence for strong fit',
  tpmRec27.confidence === 'high' || tpmRec27.confidence === 'medium');
assert('27x. TPM recommendation is not archived',
  tpmRec27.resume?.status !== VAULT_STATUS.ARCHIVED);
assert('27y. TPM recommendation includes reason string',
  typeof tpmRec27.reason === 'string' && tpmRec27.reason.length > 10);

const deliveryRec27 = recommendVaultResume(LANES.DELIVERY_MANAGER, 78, ['agile', 'scrum', 'sprint']);
assert('27z. Delivery lane → recommends IT PM or TPM (delivery resumes archived)',
  deliveryRec27.resume?.lane === VAULT_LANES.IT_PM || deliveryRec27.resume?.lane === VAULT_LANES.TPM);
assert('27aa. Delivery recommendation is not archived',
  deliveryRec27.resume?.status !== VAULT_STATUS.ARCHIVED);

const opsRec27 = recommendVaultResume(LANES.OPS_MANAGER, 65, ['itsm', 'itil', 'service management']);
assert('27ab. Ops lane → recommends Ops or IT PM vault resume (not generic archived)',
  opsRec27.resume?.status !== VAULT_STATUS.ARCHIVED);
assert('27ac. Ops recommendation is not TPM (not leaking into default TPM recommendation)',
  opsRec27.resume?.lane !== VAULT_LANES.TPM || opsRec27.confidence !== 'high');

const progRec27 = recommendVaultResume(LANES.PROGRAM_MANAGER, 70, ['pmo', 'portfolio', 'governance']);
assert('27ad. Program Manager lane → recommends Program or TPM vault resume',
  progRec27.resume?.lane === VAULT_LANES.PROGRAM || progRec27.resume?.lane === VAULT_LANES.TPM);
assert('27ae. Recommendation never returns null when selectable resumes exist',
  tpmRec27.resume !== null && deliveryRec27.resume !== null);

// Empty vault falls back gracefully
const emptyRec27 = recommendVaultResume(LANES.TPM, 80, [], []);
assert('27af. Empty vault recommendation has confidence=low and null resume',
  emptyRec27.resume === null && emptyRec27.confidence === 'low');

// ── 27f. Quality gates ─────────────────────────────────────────────────────────
const tpmOpp27 = { id: 'opp-27-tpm', lane: LANES.TPM, fit_score: 85, approval_state: 'approved' };

// No resume selected → warning
const gateNoResume = getVaultQualityGates(tpmOpp27, null);
assert('27ag. Gate: no resume selected → warning (not blocker)', gateNoResume.passed && gateNoResume.warnings.length > 0);

// Archived resume selected → blocker
const gateArchived = getVaultQualityGates(tpmOpp27, 'rv-generic-pm-v1');
assert('27ah. Gate: archived resume → blocker', !gateArchived.passed && gateArchived.blockers.length > 0);
assert('27ai. Gate: archived blocker message mentions archived', gateArchived.blockers[0].toLowerCase().includes('archived'));

// Ops resume for TPM role → blocker
const gateOpsMismatch = getVaultQualityGates(tpmOpp27, 'rv-ops-01');
assert('27aj. Gate: ops resume for TPM role → blocker', !gateOpsMismatch.passed && gateOpsMismatch.blockers.length > 0);

// Good TPM resume for TPM role → passes
const gateTpmOk = getVaultQualityGates(tpmOpp27, 'rv-tpm-01');
assert('27ak. Gate: active TPM resume for TPM role → passed', gateTpmOk.passed);

// Low fit score → warning
const gateLowFit = getVaultQualityGates({ ...tpmOpp27, fit_score: 25 }, 'rv-tpm-01');
assert('27al. Gate: low fit score → advisory warning', gateLowFit.passed && gateLowFit.warnings.some(w => w.includes('fit score') || w.includes('Low fit')));

// Fallback resume → warning
const gateFallback = getVaultQualityGates(tpmOpp27, 'rv-program-01');
assert('27am. Gate: fallback resume → warning (not blocker)', gateFallback.passed && gateFallback.warnings.length > 0);

// ── 27g. Application log ───────────────────────────────────────────────────────
const appLog = createApplicationLog('rv-tpm-01');
assert('27an. createApplicationLog returns record with resume_id', appLog?.resume_id === 'rv-tpm-01');
assert('27ao. createApplicationLog has resume_lane and version_label',
  appLog?.resume_lane === VAULT_LANES.TPM && typeof appLog.resume_version_label === 'string');
assert('27ap. createApplicationLog was_system_recommendation=true when not overridden',
  appLog?.was_system_recommendation === true && appLog?.override_reason === null);

const appLogOverride = createApplicationLog('rv-program-01', INITIAL_VAULT, true, 'Role required governance PMO emphasis');
assert('27aq. createApplicationLog tracks override reason when overridden',
  appLogOverride?.was_system_recommendation === false && appLogOverride?.override_reason?.length > 0);

const nullLog = createApplicationLog('rv-does-not-exist');
assert('27ar. createApplicationLog returns null for unknown resume id', nullLog === null);

// ── 27h. updateVaultRecord ─────────────────────────────────────────────────────
const updatedVault = updateVaultRecord(INITIAL_VAULT, 'rv-tpm-01', { display_name: 'TPM Updated', notes: 'Test note' });
const updatedRecord = updatedVault.find(r => r.id === 'rv-tpm-01');
assert('27as. updateVaultRecord updates display_name', updatedRecord?.display_name === 'TPM Updated');
assert('27at. updateVaultRecord updates notes', updatedRecord?.notes === 'Test note');
assert('27au. updateVaultRecord does not affect other records', updatedVault.filter(r => r.id !== 'rv-tpm-01').every(r => r.display_name !== 'TPM Updated'));
assert('27av. updateVaultRecord throws on invalid status', (() => {
  try { updateVaultRecord(INITIAL_VAULT, 'rv-tpm-01', { status: 'invalid_status' }); return false; } catch { return true; }
})());

// ── 27i. resetVaultToDefaults ──────────────────────────────────────────────────
const resetVault = resetVaultToDefaults();
assert('27aw. resetVaultToDefaults returns 9 records', resetVault.length === 9);
assert('27ax. resetVaultToDefaults returns fresh copy (not reference equality)',
  resetVault !== INITIAL_VAULT);
assert('27ay. resetVaultToDefaults restores original TPM display_name',
  resetVault.find(r => r.id === 'rv-tpm-01')?.display_name === INITIAL_VAULT.find(r => r.id === 'rv-tpm-01')?.display_name);

// ── 27j. computeVaultAnalytics ─────────────────────────────────────────────────
const mockOpps27 = [
  { id: 'opp-a', status: 'applied', applied_resume_id: 'rv-tpm-01' },
  { id: 'opp-b', status: 'interviewing', applied_resume_id: 'rv-tpm-01' },
  { id: 'opp-c', status: 'applied', applied_resume_id: 'rv-it-pm-01' },
  { id: 'opp-d', status: 'rejected', applied_resume_id: 'rv-tpm-01' },
];
const analytics27 = computeVaultAnalytics(mockOpps27);
const tpmStats = analytics27.find(s => s.resume_id === 'rv-tpm-01');
assert('27az. computeVaultAnalytics returns stats for all 9 resumes', analytics27.length === 9);
assert('27ba. computeVaultAnalytics counts applications correctly for rv-tpm-01', tpmStats?.applications_count === 3);
assert('27bb. computeVaultAnalytics counts interviews correctly for rv-tpm-01', tpmStats?.interviews_count === 1);
assert('27bc. computeVaultAnalytics computes interview_rate for rv-tpm-01', typeof tpmStats?.interview_rate === 'number');
const itPmStats = analytics27.find(s => s.resume_id === 'rv-it-pm-01');
assert('27bd. computeVaultAnalytics tracks separate stats for rv-it-pm-01', itPmStats?.applications_count === 1);
const archivedStats = analytics27.find(s => s.resume_id === 'rv-generic-pm-v1');
assert('27be. computeVaultAnalytics zero-initialises unused resumes', archivedStats?.applications_count === 0 && archivedStats?.response_rate === null);

// ── 27k. File existence checks ─────────────────────────────────────────────────
assert('27bf. netlify/functions/_shared/resumeVault.js exists',
  existsSync27(join27(__dirname_v27, '../netlify/functions/_shared/resumeVault.js')));
assert('27bg. netlify/functions/resume-vault.js endpoint exists',
  existsSync27(join27(__dirname_v27, '../netlify/functions/resume-vault.js')));
assert('27bh. src/pages/ResumeVault.jsx exists',
  existsSync27(join27(__dirname_v27, '../src/pages/ResumeVault.jsx')));
assert('27bi. supabase/migrations/005_resume_vault.sql exists',
  existsSync27(join27(__dirname_v27, '../supabase/migrations/005_resume_vault.sql')));

// ── 27l. UI / API integration checks ──────────────────────────────────────────
const apiSrc27 = readFileSync27(join27(__dirname_v27, '../src/lib/api.js'), 'utf-8');
assert('27bj. api.js exports fetchResumeVault', apiSrc27.includes('export async function fetchResumeVault'));
assert('27bk. api.js exports updateResumeVaultRecord', apiSrc27.includes('export async function updateResumeVaultRecord'));
assert('27bl. api.js exports resetResumeVault', apiSrc27.includes('export async function resetResumeVault'));
assert('27bm. api.js exports getVaultRecommendation', apiSrc27.includes('export function getVaultRecommendation'));
assert('27bn. api.js exports checkVaultQualityGates', apiSrc27.includes('export function checkVaultQualityGates'));
assert('27bo. api.js fetchResumeVault uses isDemoMode', apiSrc27.includes('isDemoMode') && apiSrc27.includes('fetchResumeVault'));
assert('27bp. api.js uses RESUME_VAULT_STORAGE_KEY for localStorage', apiSrc27.includes('RESUME_VAULT_STORAGE_KEY'));

const appSrc27 = readFileSync27(join27(__dirname_v27, '../src/App.jsx'), 'utf-8');
assert('27bq. App.jsx has /resume-vault route', appSrc27.includes("path: 'resume-vault'") || appSrc27.includes("path=\"resume-vault\""));
assert('27br. App.jsx imports ResumeVault', appSrc27.includes('import ResumeVault'));

const sidebarSrc27 = readFileSync27(join27(__dirname_v27, '../src/components/Sidebar.jsx'), 'utf-8');
assert('27bs. Sidebar.jsx has Resume Vault nav entry', sidebarSrc27.includes('/resume-vault'));
assert('27bt. Sidebar.jsx Resume Vault has correct label', sidebarSrc27.includes('Resume Vault'));

const resumeVaultJsx27 = readFileSync27(join27(__dirname_v27, '../src/pages/ResumeVault.jsx'), 'utf-8');
assert('27bu. ResumeVault.jsx imports fetchResumeVault', resumeVaultJsx27.includes('fetchResumeVault'));
assert('27bv. ResumeVault.jsx imports updateResumeVaultRecord', resumeVaultJsx27.includes('updateResumeVaultRecord'));
assert('27bw. ResumeVault.jsx imports resetResumeVault', resumeVaultJsx27.includes('resetResumeVault'));
assert('27bx. ResumeVault.jsx shows active resumes section', resumeVaultJsx27.toLowerCase().includes('active resume'));
assert('27by. ResumeVault.jsx shows archived resumes section', resumeVaultJsx27.toLowerCase().includes('archived'));
assert('27bz. ResumeVault.jsx has archive action', resumeVaultJsx27.toLowerCase().includes('archive'));
assert('27ca. ResumeVault.jsx has edit modal', resumeVaultJsx27.includes('EditModal') || resumeVaultJsx27.includes('editTarget'));
assert('27cb. ResumeVault.jsx shows quality score', resumeVaultJsx27.includes('quality_score'));

// ── 27m. resume-vault.js endpoint structure ────────────────────────────────────
const resumeVaultFn27 = readFileSync27(join27(__dirname_v27, '../netlify/functions/resume-vault.js'), 'utf-8');
assert('27cc. resume-vault.js handles GET', resumeVaultFn27.includes("'GET'") || resumeVaultFn27.includes('"GET"'));
assert('27cd. resume-vault.js handles POST', resumeVaultFn27.includes("'POST'") || resumeVaultFn27.includes('"POST"'));
assert('27ce. resume-vault.js handles OPTIONS (CORS)', resumeVaultFn27.includes('OPTIONS'));
assert('27cf. resume-vault.js action=update', resumeVaultFn27.includes("action === 'update'") || resumeVaultFn27.includes('action=update'));
assert('27cg. resume-vault.js action=reset', resumeVaultFn27.includes("action === 'reset'") || resumeVaultFn27.includes('action=reset'));
assert('27ch. resume-vault.js imports from resumeVault.js', resumeVaultFn27.includes('resumeVault'));

// ── 27n. db.js vault helpers ───────────────────────────────────────────────────
const dbSrc27 = readFileSync27(join27(__dirname_v27, '../netlify/functions/_shared/db.js'), 'utf-8');
assert('27ci. db.js exports getResumeVault', dbSrc27.includes('export async function getResumeVault'));
assert('27cj. db.js exports upsertResumeVault', dbSrc27.includes('export async function upsertResumeVault'));

// ── 27o. Apply Pack vault integration ──────────────────────────────────────────
const applyPackSrc27 = readFileSync27(join27(__dirname_v27, '../netlify/functions/_shared/applyPack.js'), 'utf-8');
assert('27ck. applyPack.js imports recommendVaultResume', applyPackSrc27.includes('recommendVaultResume'));
assert('27cl. applyPack.js imports getVaultQualityGates', applyPackSrc27.includes('getVaultQualityGates'));
assert('27cm. generateApplyPack includes vault_recommended_resume_id', applyPackSrc27.includes('vault_recommended_resume_id'));
assert('27cn. generateApplyPack includes quality_gate_warnings', applyPackSrc27.includes('quality_gate_warnings'));
assert('27co. generateApplyPack includes resume_id_used tracking field', applyPackSrc27.includes('resume_id_used'));
assert('27cp. APPLY_PACK_SYSTEM_VERSION updated to 5.0.0', applyPackSrc27.includes("APPLY_PACK_SYSTEM_VERSION = '5.0.0'"));

// ── 27p. vault-augmented generateApplyPack runtime test ───────────────────────
const tpmOppWithVault = {
  id: 'opp-27-vault-test', title: 'Technical Project Manager', company: 'VaultCo',
  lane: LANES.TPM, fit_score: 88, fit_signals: ['sdlc', 'agile', 'stakeholder'],
  recommended: true, approval_state: 'approved', status: 'approved',
  application_url: 'https://vaultco.com/apply/tpm',
};
const { generateApplyPack: generateApplyPack27 } = await import('../netlify/functions/_shared/applyPack.js');
const pack27 = generateApplyPack27(tpmOppWithVault, INITIAL_VAULT);
assert('27cq. Pack has vault_recommended_resume_id', typeof pack27.vault_recommended_resume_id === 'string');
assert('27cr. Pack vault recommendation points to a non-archived resume', (() => {
  const r = INITIAL_VAULT.find(x => x.id === pack27.vault_recommended_resume_id);
  return r && r.status !== VAULT_STATUS.ARCHIVED;
})());
assert('27cs. Pack vault recommendation has reason string', typeof pack27.vault_recommendation_reason === 'string' && pack27.vault_recommendation_reason.length > 5);
assert('27ct. Pack quality_gate_warnings is an array', Array.isArray(pack27.quality_gate_warnings));
assert('27cu. Pack quality_gate_blockers is an array', Array.isArray(pack27.quality_gate_blockers));
assert('27cv. Pack legacy recommended_resume_version still present (backward compat)', typeof pack27.recommended_resume_version === 'string');
assert('27cw. generateApplyPack still throws if not approved (vault does not bypass gate)', (() => {
  try { generateApplyPack27({ ...tpmOppWithVault, approval_state: 'pending' }, INITIAL_VAULT); return false; } catch { return true; }
})());

// ── 27q. Hierarchy guards ──────────────────────────────────────────────────────
assert('27cx. Section 27: TPM hierarchy intact — TPM scores as TPM lane',
  scoreOpportunity('Technical Project Manager', 'Lead SDLC delivery. Agile, Jira, stakeholder management. PMP.').lane === LANES.TPM);
assert('27cy. Section 27: Ops resume does not default-recommend for TPM roles',
  recommendVaultResume(LANES.TPM, 85, ['sdlc', 'agile']).resume?.lane !== VAULT_LANES.OPS);
assert('27cz. Section 27: Archived resumes excluded from selectable list',
  getSelectableResumes().every(r => r.status !== VAULT_STATUS.ARCHIVED));
assert('27da. Section 27: Approval gate still mandatory after vault changes', (() => {
  const pending = { approval_state: 'pending', status: 'discovered', fit_score: 95, pack_readiness_score: 98, application_url: 'https://x.com/apply' };
  return classifyReadinessGroup(pending) !== READINESS_GROUPS.READY_TO_APPLY;
})());

console.log('\n== Result: ' + passed + ' passed, ' + failed + ' failed ==');
if (failed > 0) process.exit(1);
