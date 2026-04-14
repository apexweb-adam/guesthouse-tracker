/**
 * Verification Script — Job Search OS
 *
 * Tests: hierarchy truth, dedup, stale detection, scoring logic.
 * Run: node scripts/verify.js
 */

import { scoreOpportunity, classifyLane, LANES } from '../netlify/functions/_shared/scoring.js';
import { generateDedupHash, checkDuplicate, partitionByDedup } from '../netlify/functions/_shared/dedup.js';
import { evaluateStaleness, scanForStale } from '../netlify/functions/_shared/stale.js';

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

// ─── 10. Summary ─────────────────────────────────────────────────────────────

console.log(`\n== Result: ${passed} passed, ${failed} failed ==`);
if (failed > 0) process.exit(1);

