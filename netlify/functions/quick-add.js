/**
 * Netlify Function: /quick-add
 *
 * POST → Quick Add from External Posting
 *
 * Accepts a user-pasted job description (from LinkedIn, company sites, etc.)
 * along with a reference URL and optional apply URL.
 *
 * This is NOT scraping. The user provides all text manually.
 * LinkedIn URLs are accepted only as reference_posting_url — never fetched.
 *
 * Required body fields:
 *   reference_posting_url  string  URL where user found the role (can be LinkedIn)
 *   pasted_jd_text         string  Full job description text pasted by the user
 *   title                  string  Role title (required if not parseable from JD)
 *   company                string  Company name (required if not parseable from JD)
 *
 * Optional body fields:
 *   external_apply_url     string  Direct apply URL (if different from reference URL)
 *   location               string
 *   notes                  string
 */

import { processBatch, isDemoMode } from './_shared/db.js';
import { SOURCE_FAMILIES } from './_shared/sources.js';
import { stripHtml } from './_shared/jobFinder.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

/**
 * Detect whether a URL is from LinkedIn so we handle it safely.
 * LinkedIn URLs are stored as reference_posting_url only — never fetched.
 */
function isLinkedInUrl(url = '') {
  return /linkedin\.com/i.test(url);
}

/**
 * Attempt to extract a canonical ATS URL from the reference URL.
 * Only returns a canonical URL for known public ATS patterns (Greenhouse, Lever).
 * LinkedIn URLs are excluded — they are reference-only.
 */
function deriveCanonicalUrl(referenceUrl = '', externalApplyUrl = '') {
  if (externalApplyUrl) return externalApplyUrl;
  if (!referenceUrl || isLinkedInUrl(referenceUrl)) return null;
  // Greenhouse boards
  if (/boards\.greenhouse\.io/i.test(referenceUrl)) return referenceUrl;
  // Lever postings
  if (/jobs\.lever\.co/i.test(referenceUrl)) return referenceUrl;
  // For any other public URL (company careers page, etc.), use as canonical
  return referenceUrl;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const {
    reference_posting_url = '',
    pasted_jd_text = '',
    external_apply_url = '',
    title = '',
    company = '',
    location = '',
    notes = '',
  } = body;

  // ── Validation ──────────────────────────────────────────────────────────────

  if (!reference_posting_url.trim()) {
    return json(400, { error: 'reference_posting_url is required. Paste the URL where you found this role.' });
  }
  if (!pasted_jd_text.trim()) {
    return json(400, { error: 'pasted_jd_text is required. Paste the full job description text.' });
  }
  if (!title.trim()) {
    return json(400, { error: 'title is required. Enter the role title as shown in the posting.' });
  }
  if (!company.trim()) {
    return json(400, { error: 'company is required. Enter the company name from the posting.' });
  }

  // ── Safety check for LinkedIn ────────────────────────────────────────────────
  // We NEVER fetch content from LinkedIn. The URL is stored as reference only.
  const sourceIsLinkedIn = isLinkedInUrl(reference_posting_url);

  // ── URL model ────────────────────────────────────────────────────────────────
  const canonical_job_url = deriveCanonicalUrl(reference_posting_url, external_apply_url);
  const application_url = external_apply_url.trim() || null;

  // ── Normalise JD text ────────────────────────────────────────────────────────
  // Strip HTML tags in case the user pasted from a formatted page
  const description = stripHtml(pasted_jd_text.trim());

  // ── Build job record ─────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const jobRecord = {
    title: title.trim(),
    company: company.trim(),
    location: location.trim() || null,
    description,

    // URL model
    url: canonical_job_url || reference_posting_url,
    canonical_job_url: canonical_job_url,
    application_url,
    reference_posting_url: reference_posting_url.trim(),

    // Source / provenance
    source_family: SOURCE_FAMILIES.MANUAL_EXTERNAL,
    source_type: 'manual',
    source_job_id: null,
    is_demo_record: false,
    is_manual_external_intake: true,
    intake_source_is_linkedin: sourceIsLinkedIn,

    // Metadata
    notes: notes.trim() || null,
    pasted_jd_text_length: description.length,
    discovered_at: now,
  };

  // ── Deduplicate + Score + Persist ─────────────────────────────────────────────
  try {
    const { inserted, deduped, errors } = await processBatch(
      [jobRecord],
      'src-manual-external'
    );

    if (errors.length && !inserted.length) {
      return json(400, { error: errors[0]?.error || 'Failed to save opportunity' });
    }

    if (deduped.length) {
      return json(200, {
        ok: true,
        duplicate: true,
        message: 'This opportunity already exists in your queue (deduplicated). No duplicate was created.',
      });
    }

    const saved = inserted[0];
    return json(201, {
      ok: true,
      duplicate: false,
      demo: isDemoMode(),
      intake_source_is_linkedin: sourceIsLinkedIn,
      opportunity: saved,
      message: sourceIsLinkedIn
        ? 'Role added from LinkedIn reference. The system has NOT fetched LinkedIn — this is purely paste-based intake.'
        : 'Role added successfully and queued for approval.',
    });
  } catch (err) {
    console.error('[quick-add]', err);
    return json(500, { error: err.message });
  }
};
