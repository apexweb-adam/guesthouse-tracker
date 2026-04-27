/**
 * Netlify Scheduled Function: stale-scan-scheduled
 *
 * Runs daily to detect stale/ghosted opportunities and flag them.
 * Flags opportunities but does NOT auto-update status — human approval required.
 *
 * Schedule: daily at 08:00 UTC
 */

import { listOpportunities, updateOpportunity, logIngestion, isDemoMode } from './_shared/db.js';
import { scanForStale } from './_shared/stale.js';

async function runStaleScan() {
  if (isDemoMode()) {
    console.log('[stale-scan] Demo mode — skipping stale scan.');
    return { skipped: 'demo_mode', scanned: 0, flagged: 0 };
  }

  // Only scan active/in-progress opportunities
  const activeStatuses = ['applied', 'interviewing', 'offer', 'approved'];
  let allActive = [];

  for (const status of activeStatuses) {
    const opps = await listOpportunities({ status });
    allActive = allActive.concat(opps);
  }

  const staleOpps = scanForStale(allActive);

  let flagged = 0;
  const errors = [];

  for (const opp of staleOpps) {
    try {
      // Only flag if not already marked stale/ghosted
      if (opp.status !== 'stale' && opp.status !== 'ghosted') {
        await updateOpportunity(opp.id, {
          stale_flag: true,
          stale_reason: opp.reason,
          suggested_next_status: opp.suggestedNextStatus,
          stale_flagged_at: new Date().toISOString(),
        });
        flagged++;
      }
    } catch (err) {
      errors.push(`${opp.id}: ${err.message}`);
    }
  }

  await logIngestion({
    source_id: 'stale-scan',
    count_discovered: allActive.length,
    count_deduped: 0,
    count_new: flagged,
    errors,
    status: errors.length ? 'partial' : 'success',
  });

  console.log(`[stale-scan] Scanned ${allActive.length} active opps, flagged ${flagged} stale/ghosted.`);
  return { scanned: allActive.length, flagged, errors: errors.length };
}

export const handler = async () => {
  try {
    const summary = await runStaleScan();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, summary }),
    };
  } catch (err) {
    console.error('[stale-scan] Fatal error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
