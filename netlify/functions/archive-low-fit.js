/**
 * Netlify Function: /archive-low-fit
 *
 * Moves low-fit opportunities into a reversible archive bucket.
 * This is intentionally a soft delete so the candidate can still audit what happened.
 */

import { listOpportunities, updateOpportunity, isDemoMode } from './_shared/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

const CLOSED_STATUSES = new Set(['applied', 'interviewing', 'offer', 'rejected', 'ghosted', 'withdrawn', 'archived_low_fit']);

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { max_score = 49, max_jobs = 150, dry_run = false } = JSON.parse(event.body || '{}');
    const maxScore = Number(max_score);
    const maxJobs = Math.max(1, Math.min(200, Number(max_jobs) || 150));
    if (!Number.isFinite(maxScore)) return json(400, { error: 'max_score must be a number' });

    const opportunities = await listOpportunities();
    const targets = opportunities.filter(opp => {
      const score = Number(opp.fit_score || 0);
      return score <= maxScore && !CLOSED_STATUSES.has(opp.status);
    }).sort((a, b) => Number(a.fit_score || 0) - Number(b.fit_score || 0));
    const batch = targets.slice(0, maxJobs);

    if (dry_run) {
      return json(200, {
        ok: true,
        dry_run: true,
        count: targets.length,
        max_jobs: maxJobs,
        preview: batch.slice(0, 25).map(({ id, title, company, fit_score, status }) => ({ id, title, company, fit_score, status })),
        demo: isDemoMode(),
      });
    }

    const now = new Date().toISOString();
    let archived = 0;
    const errors = [];

    for (const opp of batch) {
      try {
        await updateOpportunity(opp.id, {
          status: 'archived_low_fit',
          notes: [opp.notes, `Archived because fit score was ${opp.fit_score || 0}, below the ${maxScore + 1}+ review band.`]
            .filter(Boolean)
            .join('\n'),
          last_action_date: now,
        });
        archived += 1;
      } catch (err) {
        errors.push({ id: opp.id, error: err.message });
      }
    }

    return json(200, {
      ok: true,
      archived,
      errors,
      remaining_eligible: Math.max(0, targets.length - archived),
      max_jobs: maxJobs,
      demo: isDemoMode(),
    });
  } catch (err) {
    console.error('[archive-low-fit]', err);
    return json(500, { error: err.message });
  }
};
