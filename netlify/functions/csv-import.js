/**
 * Netlify Function: /csv-import
 *
 * POST { csv: string, source?: string }
 *
 * Parses CSV text and runs it through the intake pipeline.
 * Expected columns (flexible, case-insensitive):
 *   title, company, location, url, description
 *
 * Also accepts uploaded CSV body as plain text Content-Type.
 */

import { processBatch, logIngestion, isDemoMode } from './_shared/db.js';
import { SOURCE_TYPES } from './_shared/sources.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

/**
 * Minimal CSV parser — handles quoted fields, comma-delimited.
 * No external dependency required.
 */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const fields = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.every(v => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }

  return rows;
}

/**
 * Map flexible column names to canonical fields.
 */
function normalizeRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k] || row[k.replace(/_/g, '')] || row[k.replace(/_/g, ' ')];
      if (v) return v;
    }
    return '';
  };
  return {
    title: get('title', 'job_title', 'jobtitle', 'role', 'position'),
    company: get('company', 'employer', 'organisation', 'organization', 'company_name'),
    location: get('location', 'city', 'place'),
    url: get('url', 'link', 'job_url', 'apply_url', 'application_url'),
    description: get('description', 'job_description', 'desc', 'details', 'summary'),
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    let csvText = '';
    let sourceId = 'src-csv';

    const contentType = event.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      const body = JSON.parse(event.body || '{}');
      csvText = body.csv || '';
      sourceId = body.source || 'src-csv';
    } else {
      // Plain text body
      csvText = event.body || '';
    }

    if (!csvText.trim()) return json(400, { error: 'CSV text is required' });

    const rows = parseCSV(csvText);
    if (!rows.length) return json(400, { error: 'No valid rows found in CSV' });

    const jobs = rows.map(normalizeRow).filter(j => j.title);

    if (!jobs.length) {
      return json(400, { error: 'No rows with a valid title column found. Check your CSV headers.' });
    }

    const { inserted, deduped, errors } = await processBatch(jobs, sourceId);

    await logIngestion({
      source_id: sourceId,
      count_discovered: jobs.length,
      count_deduped: deduped.length,
      count_new: inserted.length,
      errors: errors.map(e => e.error || String(e)),
      status: errors.length > 0 && inserted.length === 0 ? 'failure' : errors.length > 0 ? 'partial' : 'success',
    });

    return json(200, {
      summary: {
        rows_parsed: rows.length,
        valid_jobs: jobs.length,
        new: inserted.length,
        deduped: deduped.length,
        errors: errors.length,
      },
      inserted: inserted.map(o => ({
        id: o.id,
        title: o.title,
        company: o.company,
        fit_score: o.fit_score,
        lane: o.lane,
        recommended: o.recommended,
      })),
      demo: isDemoMode(),
    });
  } catch (err) {
    console.error('[csv-import]', err);
    return json(500, { error: err.message });
  }
};
