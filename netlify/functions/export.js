/**
 * Netlify Function: /export
 *
 * GET ?format=json|csv&includeLogs=true|false
 *
 * Returns all opportunity data as a downloadable backup.
 * JSON includes full records including signals, audit trail, and source metadata.
 * CSV is flattened and suitable for spreadsheet import.
 */

import { listOpportunities, isDemoMode } from './_shared/db.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

const CSV_COLUMNS = [
  'id', 'title', 'company', 'location', 'url',
  'lane', 'fit_score', 'recommended', 'high_fit', 'resume_emphasis',
  'status', 'approval_state',
  'source', 'ingested_at', 'last_action_date',
  'stale_flag', 'description',
];

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(opportunities) {
  const header = CSV_COLUMNS.join(',');
  const rows = opportunities.map(o =>
    CSV_COLUMNS.map(col => escapeCSV(o[col])).join(',')
  );
  return [header, ...rows].join('\n');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });

  const format = event.queryStringParameters?.format || 'json';
  if (!['json', 'csv'].includes(format)) {
    return jsonResponse(400, { error: 'format must be json or csv' });
  }

  try {
    const opportunities = await listOpportunities();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'csv') {
      const csvData = toCSV(opportunities);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="job-search-export-${timestamp}.csv"`,
          ...CORS,
        },
        body: csvData,
      };
    }

    // JSON export
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="job-search-export-${timestamp}.json"`,
        ...CORS,
      },
      body: JSON.stringify({
        exportedAt: new Date().toISOString(),
        demo: isDemoMode(),
        count: opportunities.length,
        opportunities,
      }),
    };
  } catch (err) {
    console.error('[export]', err);
    return jsonResponse(500, { error: err.message });
  }
};
