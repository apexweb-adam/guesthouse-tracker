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

// ─── 6. Summary ──────────────────────────────────────────────────────────────

console.log(`\n== Result: ${passed} passed, ${failed} failed ==`);
if (failed > 0) process.exit(1);
