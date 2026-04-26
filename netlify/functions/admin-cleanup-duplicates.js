import { deleteOpportunities, listOpportunities } from './_shared/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value = '') {
  try {
    const url = new URL(value);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'trk']
      .forEach(key => url.searchParams.delete(key));
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return normalizeText(value);
  }
}

function exactKey(opp = {}) {
  return [
    normalizeText(opp.title),
    normalizeText(opp.company),
    normalizeText(opp.location),
    normalizeUrl(opp.url || opp.canonical_job_url || opp.application_url || ''),
  ].join('|');
}

function keepRank(opp) {
  const statusRank = {
    offer: 0,
    interviewing: 1,
    applied: 2,
    ready_to_apply: 3,
    apply_pack_generated: 4,
    approved: 5,
    discovered: 6,
  }[opp.status] ?? 7;
  const sourceRank = String(opp.source || '').includes('backfill') ? 1 : 0;
  return [statusRank, sourceRank, Date.parse(opp.ingested_at || opp.created_at || 0) || 0];
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = JSON.parse(event.body || '{}');
  if (body.confirm !== 'delete-exact-duplicates') {
    return json(400, { error: 'confirm must be delete-exact-duplicates' });
  }

  const dryRun = body.dryRun !== false;
  const opportunities = await listOpportunities();
  const groups = new Map();

  for (const opp of opportunities) {
    const key = exactKey(opp);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(opp);
  }

  const duplicateGroups = [...groups.values()].filter(group => group.length > 1);
  const idsToDelete = [];
  const preview = [];

  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => {
      const ar = keepRank(a);
      const br = keepRank(b);
      return ar[0] - br[0] || ar[1] - br[1] || ar[2] - br[2];
    });
    const keep = sorted[0];
    const remove = sorted.slice(1);
    idsToDelete.push(...remove.map(opp => opp.id));
    if (preview.length < 10) {
      preview.push({
        keep: { id: keep.id, title: keep.title, company: keep.company, source: keep.source, status: keep.status },
        remove: remove.map(opp => ({ id: opp.id, source: opp.source, status: opp.status })),
      });
    }
  }

  let deleted = [];
  if (!dryRun && idsToDelete.length) {
    deleted = await deleteOpportunities(idsToDelete);
  }

  return json(200, {
    dryRun,
    total: opportunities.length,
    duplicateGroups: duplicateGroups.length,
    duplicateRows: idsToDelete.length,
    wouldRemain: opportunities.length - idsToDelete.length,
    deleted: deleted.length,
    preview,
  });
};
