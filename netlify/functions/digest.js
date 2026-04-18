/**
 * Netlify Function: /digest
 *
 * GET ?type=approval|stale|weekly|ingestion|daily
 *
 * Generates structured digest summaries from live system data.
 * Used by n8n, Zapier, and the Reports page.
 *
 * Types:
 *   approval  → pending approval queue summary
 *   stale     → stale / ghosted opportunities needing follow-up
 *   weekly    → conversion funnel + ingestion summary (last 7 days)
 *   ingestion → per-source ingestion run summary
 *   daily     → per-source-family summary of jobs ingested in last 24h
 */

import { listOpportunities, listIngestionLogs, isDemoMode } from './_shared/db.js';
import { scanForStale } from './_shared/stale.js';
import { LANE_CONFIG } from './_shared/scoring.js';
import { computeReadinessSummary } from './_shared/readiness.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

async function approvalDigest() {
  const allOpps = await listOpportunities();
  const pending = allOpps
    .filter(o => o.approval_state === 'pending' && !['rejected', 'ghosted', 'stale'].includes(o.status))
    .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0));

  const topFive = pending.slice(0, 5).map(o => ({
    id: o.id,
    title: o.title,
    company: o.company,
    lane: o.lane,
    laneLabel: LANE_CONFIG[o.lane]?.label || o.lane,
    fitScore: o.fit_score,
    recommended: o.recommended,
    highFit: o.high_fit,
    ingestedAt: o.ingested_at,
  }));

  return {
    type: 'approval',
    summary: `${pending.length} opportunit${pending.length === 1 ? 'y' : 'ies'} pending approval`,
    totalPending: pending.length,
    recommendedCount: pending.filter(o => o.recommended).length,
    highFitCount: pending.filter(o => o.high_fit).length,
    topOpportunities: topFive,
    generatedAt: new Date().toISOString(),
  };
}

async function staleDigest() {
  const activeStatuses = ['applied', 'interviewing', 'offer', 'approved'];
  let active = [];
  for (const status of activeStatuses) {
    const opps = await listOpportunities({ status });
    active = active.concat(opps);
  }

  const stale = scanForStale(active);
  const ghosted = stale.filter(o => o.isGhosted);
  const staleOnly = stale.filter(o => o.isStale && !o.isGhosted);

  return {
    type: 'stale',
    summary: `${stale.length} opportunit${stale.length === 1 ? 'y' : 'ies'} need follow-up or closure (${ghosted.length} ghosted)`,
    totalStale: stale.length,
    ghostedCount: ghosted.length,
    staleCount: staleOnly.length,
    items: stale.map(o => ({
      id: o.id,
      title: o.title,
      company: o.company,
      status: o.status,
      daysSinceAction: o.daysSinceAction,
      isGhosted: o.isGhosted,
      reason: o.reason,
      suggestedAction: o.suggestedAction,
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function weeklyDigest() {
  const allOpps = await listOpportunities();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentOpps = allOpps.filter(o => o.ingested_at >= sevenDaysAgo);
  const logs = await listIngestionLogs({ limit: 100 });
  const recentLogs = logs.filter(l => l.run_at >= sevenDaysAgo);

  const pending = allOpps.filter(o => o.approval_state === 'pending' && !['rejected', 'ghosted', 'stale'].includes(o.status));

  const funnel = {
    discovered: allOpps.filter(o => ['discovered', 'queued'].includes(o.status)).length,
    pendingApproval: pending.length,
    approved: allOpps.filter(o => o.approval_state === 'approved').length,
    applied: allOpps.filter(o => o.status === 'applied').length,
    interviewing: allOpps.filter(o => o.status === 'interviewing').length,
    offers: allOpps.filter(o => o.status === 'offer').length,
    rejected: allOpps.filter(o => o.status === 'rejected').length,
  };

  const readiness = computeReadinessSummary(allOpps);

  return {
    type: 'weekly',
    summary: `Weekly digest: ${recentOpps.length} new opportunities ingested, ${funnel.pendingApproval} pending approval, ${funnel.interviewing} in interview, ${readiness.readyToApplyCount} ready to apply`,
    weekStart: sevenDaysAgo,
    newThisWeek: recentOpps.length,
    funnel,
    readiness,
    ingestion: {
      runsTotal: recentLogs.length,
      newJobsIngested: recentLogs.reduce((n, l) => n + (l.count_new || 0), 0),
      dedupedTotal: recentLogs.reduce((n, l) => n + (l.count_deduped || 0), 0),
      failures: recentLogs.filter(l => l.status === 'failure').length,
    },
    laneBreakdown: Object.fromEntries(
      Object.keys(LANE_CONFIG).map(lane => [
        lane,
        allOpps.filter(o => o.lane === lane && o.status !== 'rejected').length,
      ])
    ),
    generatedAt: new Date().toISOString(),
  };
}

async function ingestionDigest() {
  const logs = await listIngestionLogs({ limit: 50 });
  const bySource = {};
  for (const log of logs) {
    if (!bySource[log.source_id]) {
      bySource[log.source_id] = {
        sourceId: log.source_id, runs: 0, totalNew: 0,
        totalDeduped: 0, failures: 0, lastRun: null, lastStatus: null,
      };
    }
    const s = bySource[log.source_id];
    s.runs++;
    s.totalNew += log.count_new || 0;
    s.totalDeduped += log.count_deduped || 0;
    if (log.status === 'failure') s.failures++;
    if (!s.lastRun || log.run_at > s.lastRun) {
      s.lastRun = log.run_at;
      s.lastStatus = log.status;
    }
  }

  const sources = Object.values(bySource).sort((a, b) => (b.lastRun || '').localeCompare(a.lastRun || ''));
  const failingSources = sources.filter(s => s.failures > 0);

  return {
    type: 'ingestion',
    summary: `${logs.length} ingestion log entries across ${sources.length} sources (${failingSources.length} with failures)`,
    sourceSummaries: sources,
    recentLogs: logs.slice(0, 10).map(l => ({
      id: l.id, sourceId: l.source_id, status: l.status,
      countNew: l.count_new, countDeduped: l.count_deduped, runAt: l.run_at, errors: l.errors || [],
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function dailyDigest() {
  const allOpps = await listOpportunities();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

  const todayOpps = allOpps.filter(o =>
    (o.discovered_at || o.ingested_at || '') >= oneDayAgo
  );

  const familyMap = {};
  for (const o of todayOpps) {
    const sf = o.source_family || 'manual';
    if (!familyMap[sf]) {
      familyMap[sf] = { source_family: sf, new_today: 0, high_fit_today: 0, recommended_today: 0, score_sum: 0 };
    }
    const fm = familyMap[sf];
    fm.new_today++;
    if ((o.fit_score || 0) >= 85) fm.high_fit_today++;
    if (o.recommended) fm.recommended_today++;
    fm.score_sum += (o.fit_score || 0);
  }

  const per_source_family = Object.values(familyMap).map(fm => ({
    source_family: fm.source_family,
    new_today: fm.new_today,
    high_fit_today: fm.high_fit_today,
    recommended_today: fm.recommended_today,
    avg_score: fm.new_today > 0 ? Math.round(fm.score_sum / fm.new_today) : 0,
  })).sort((a, b) => b.new_today - a.new_today);

  const high_fit_roles = todayOpps
    .filter(o => (o.fit_score || 0) >= 85)
    .sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
    .slice(0, 10)
    .map(o => ({
      id: o.id,
      title: o.title,
      company: o.company,
      fit_score: o.fit_score,
      source_family: o.source_family,
      lane: o.lane,
    }));

  const readiness = computeReadinessSummary(allOpps);

  const blocked_by_missing_url = allOpps.filter(o =>
    o.approval_state === 'approved' && !o.application_url && !o.canonical_job_url
  ).length;

  const approval_needed = allOpps.filter(o =>
    o.approval_state === 'pending' && !['rejected', 'ghosted', 'stale'].includes(o.status)
  ).length;

  const totalToday = todayOpps.length;
  const highFitToday = todayOpps.filter(o => (o.fit_score || 0) >= 85).length;

  return {
    type: 'daily',
    per_source_family,
    high_fit_roles,
    readiness,
    blocked_by_missing_url,
    approval_needed,
    summary: `Daily digest: ${totalToday} new role${totalToday !== 1 ? 's' : ''} today, ${highFitToday} high-fit (score ≥ 85), ${approval_needed} pending approval`,
    generatedAt: new Date().toISOString(),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  const type = event.queryStringParameters?.type || 'approval';
  const validTypes = ['approval', 'stale', 'weekly', 'ingestion', 'daily'];
  if (!validTypes.includes(type)) {
    return json(400, { error: `type must be one of: ${validTypes.join(', ')}` });
  }

  try {
    let digest;
    if (type === 'approval') digest = await approvalDigest();
    else if (type === 'stale') digest = await staleDigest();
    else if (type === 'weekly') digest = await weeklyDigest();
    else if (type === 'daily') digest = await dailyDigest();
    else digest = await ingestionDigest();

    return json(200, { digest, demo: isDemoMode() });
  } catch (err) {
    console.error('[digest]', err);
    return json(500, { error: err.message });
  }
};
