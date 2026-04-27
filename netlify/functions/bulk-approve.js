/**
 * Netlify Function: /bulk-approve
 *
 * POST — Bulk-approves pending opportunities above a score threshold.
 *
 * This addresses the backlog of jobs in the DB that have never been individually
 * reviewed in the tracker UI. It approves all jobs that:
 *   - approval_state = 'pending'
 *   - status NOT IN ('rejected', 'ghosted', 'stale', 'applied', 'interviewing', 'offer')
 *   - fit_score >= min_score (default: 70)
 *   - recommended = true
 *
 * For each approved job:
 *   - Generates an Apply Pack
 *   - Sets auto_apply_eligible = true when fit_score >= auto_apply_threshold (default: 75)
 *     → the Python job agent reads this flag in Phase 4 to decide which roles to auto-submit
 *
 * Body params (all optional):
 *   min_score              {number}  Minimum fit score to approve (default: 70)
 *   auto_apply_threshold   {number}  Score >= this sets auto_apply_eligible=true (default: 75)
 *   max_jobs               {number}  Max jobs to approve per call (default: 50, hard cap: 200)
 *   dry_run                {boolean} When true: returns what would be approved without writing
 *
 * Auth: Requires Authorization: Bearer <DISCOVERY_SECRET>
 *       or X-Discovery-Secret: <DISCOVERY_SECRET> header.
 *       (Same auth pattern as /discover)
 *
 * Requires migration 005 (supabase/migrations/005_auto_apply_fields.sql) to be applied
 * before the auto_apply_eligible flag takes effect.
 *
 * Typical usage to clear the backlog:
 *   POST /bulk-approve { "min_score": 70, "max_jobs": 200 }
 *   Repeat until approved = 0.
 */

import { listOpportunities, updateOpportunity, insertReadinessHistory } from './_shared/db.js';
import { generateApplyPack } from './_shared/applyPack.js';
import { fireEvent } from './_shared/prep.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Discovery-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

function isAuthorized(event) {
  const secret = process.env.DISCOVERY_SECRET;
  // If no secret is configured the endpoint is restricted — reject all.
  if (!secret) return false;
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const secretHeader = event.headers?.['x-discovery-secret'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() === secret;
  }
  return secretHeader === secret;
}

const DEFAULT_MIN_SCORE = 70;
const DEFAULT_AUTO_APPLY_THRESHOLD = 75;
const DEFAULT_MAX_JOBS = 50;
const HARD_MAX_JOBS = 200;

// Statuses that should never be bulk-approved (already actioned or terminal).
// Note: apply_pack_generated and needs_apply_url imply approval_state='approved', so they
// are already excluded by the approval_state='pending' query above — not needed here.
const SKIP_STATUSES = new Set([
  'rejected', 'ghosted', 'stale', 'applied', 'interviewing', 'offer',
]);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST required' });

  if (!isAuthorized(event)) {
    return json(401, {
      error: 'Unauthorized. Send Authorization: Bearer <DISCOVERY_SECRET> or X-Discovery-Secret: <DISCOVERY_SECRET>',
    });
  }

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  const minScore = typeof body.min_score === 'number' ? body.min_score : DEFAULT_MIN_SCORE;
  const autoApplyThreshold = typeof body.auto_apply_threshold === 'number'
    ? body.auto_apply_threshold
    : DEFAULT_AUTO_APPLY_THRESHOLD;
  const maxJobs = Math.min(
    typeof body.max_jobs === 'number' ? body.max_jobs : DEFAULT_MAX_JOBS,
    HARD_MAX_JOBS
  );
  const dryRun = body.dry_run === true;

  // Fetch all pending opportunities
  const allOpps = await listOpportunities({ approval_state: 'pending' });

  // Total matching before the max_jobs cap — used to report remaining after this batch
  const totalEligible = allOpps.filter(o =>
    !SKIP_STATUSES.has(o.status) &&
    (o.fit_score || 0) >= minScore &&
    o.recommended === true
  );
  const eligible = totalEligible.slice(0, maxJobs);

  if (eligible.length === 0) {
    return json(200, {
      ok: true,
      dry_run: dryRun,
      approved: 0,
      auto_apply_eligible: 0,
      skipped: 0,
      message: `No pending recommended opportunities with fit_score >= ${minScore}.`,
      min_score: minScore,
      max_jobs: maxJobs,
    });
  }

  // Dry run — return what would be approved without writing
  if (dryRun) {
    return json(200, {
      ok: true,
      dry_run: true,
      would_approve: eligible.length,
      would_auto_apply_eligible: eligible.filter(o => (o.fit_score || 0) >= autoApplyThreshold).length,
      min_score: minScore,
      auto_apply_threshold: autoApplyThreshold,
      max_jobs: maxJobs,
      jobs: eligible.map(o => ({
        id: o.id,
        title: o.title,
        company: o.company,
        fit_score: o.fit_score,
        lane: o.lane,
        would_auto_apply: (o.fit_score || 0) >= autoApplyThreshold,
      })),
    });
  }

  const now = new Date().toISOString();
  const results = [];
  let approvedCount = 0;
  let autoApplyEligibleCount = 0;
  let errorCount = 0;

  for (const opp of eligible) {
    try {
      const isAutoApplyEligible = (opp.fit_score || 0) >= autoApplyThreshold;

      const humanOverride = {
        action: 'approve',
        reason: `Bulk approved: fit_score=${opp.fit_score} >= threshold=${minScore}`,
        decided_at: now,
        original_recommendation: opp.recommended,
        original_fit_score: opp.fit_score,
        original_lane: opp.lane,
        bulk_approved: true,
      };

      const updates = {
        approval_state: 'approved',
        status: 'approved',
        human_override: humanOverride,
        last_action_date: now,
        auto_apply_eligible: isAutoApplyEligible,
      };

      // Generate Apply Pack
      try {
        const oppForPack = { ...opp, ...updates, approval_state: 'approved' };
        const applyPack = generateApplyPack(oppForPack);
        updates.apply_pack = applyPack;
        updates.pack_readiness_score = applyPack.pack_readiness_score || 0;
        const hasApplyUrl = !!(opp.application_url || '').trim();
        if (opp.is_manual_external_intake && !hasApplyUrl) {
          updates.status = 'needs_apply_url';
          updates.apply_pack_missing_url = true;
        } else {
          updates.status = 'apply_pack_generated';
          updates.apply_pack_missing_url = false;
        }
      } catch (packErr) {
        // Pack generation failure should not block approval
        console.warn(`[bulk-approve] Pack generation failed for ${opp.id} (non-fatal):`, packErr.message);
        updates.status = 'approved';
      }

      await updateOpportunity(opp.id, updates);

      await insertReadinessHistory(opp.id, 'approval_state_changed', {
        from: opp.approval_state,
        to: 'approved',
        action: 'bulk_approve',
        reason: humanOverride.reason,
      }).catch(() => {});

      if (updates.status && updates.status !== opp.status) {
        await insertReadinessHistory(opp.id, 'status_changed', {
          from: opp.status,
          to: updates.status,
          source: 'bulk_approve',
        }).catch(() => {});
      }

      approvedCount++;
      if (isAutoApplyEligible) autoApplyEligibleCount++;
      results.push({
        id: opp.id,
        title: opp.title,
        company: opp.company,
        fit_score: opp.fit_score,
        status: updates.status,
        auto_apply_eligible: isAutoApplyEligible,
      });
    } catch (err) {
      console.error(`[bulk-approve] Error approving ${opp.id}:`, err.message);
      errorCount++;
      results.push({ id: opp.id, title: opp.title, error: err.message });
    }
  }

  if (approvedCount > 0) {
    await fireEvent('bulk_approve_complete', {
      approved: approvedCount,
      auto_apply_eligible: autoApplyEligibleCount,
      min_score: minScore,
      auto_apply_threshold: autoApplyThreshold,
      timestamp: now,
    }).catch(() => {});
  }

  return json(200, {
    ok: true,
    dry_run: false,
    approved: approvedCount,
    auto_apply_eligible: autoApplyEligibleCount,
    errors: errorCount,
    min_score: minScore,
    auto_apply_threshold: autoApplyThreshold,
    max_jobs: maxJobs,
    // If there are more pending jobs than max_jobs, report how many remain
    // (totalEligible was computed before processing; subtract successfully approved jobs)
    remaining_eligible: Math.max(0, totalEligible.length - approvedCount),
    results,
  });
};
