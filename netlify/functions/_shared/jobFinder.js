/**
 * Job Finder — Real Job Discovery Engine
 *
 * Adapters for governed, structured job sources:
 *   - Greenhouse public job board JSON API
 *   - Lever public postings JSON API
 *   - USAJobs REST API (federal government)
 *   - RSS/Atom feeds (SEEK, APSJobs, etc.)
 *
 * Rules:
 *   - No LinkedIn scraping or automation
 *   - No arbitrary crawling
 *   - All discovered jobs are normalised to a standard schema
 *   - Discovery Profile filtering is applied before scoring
 *   - canonical_job_url is always stored (real posting link)
 *   - application_url is stored when it differs from canonical_job_url
 *   - is_demo_record is never set to true by this module
 *
 * This module is a pure discovery + normalisation layer.
 * Scoring, dedup, and intake happen in db.js / scoring.js (existing pipeline).
 */

import { passesDiscoveryProfile, DEFAULT_DISCOVERY_PROFILE, SOURCE_FAMILIES } from './sources.js';

// ─── Shared request helper ────────────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'JobSearchOS/1.0 (structured-feed-reader)',
      'Accept': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JobSearchOS/1.0 (structured-feed-reader)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ─── Normalised job record schema ─────────────────────────────────────────────

/**
 * Normalise any discovered job to the standard intake schema.
 * Adds canonical_job_url, application_url, source_job_id, source_family, is_demo_record.
 */
export function normaliseJob({
  title,
  company,
  description,
  location,
  canonical_job_url,
  application_url,
  source_job_id,
  source_family,
  source_id,
  extra = {},
}) {
  return {
    title: String(title || '').trim(),
    company: String(company || '').trim(),
    description: String(description || '').trim(),
    location: String(location || '').trim(),
    canonical_job_url: canonical_job_url ? String(canonical_job_url).trim() : null,
    application_url: application_url ? String(application_url).trim() : null,
    source_job_id: source_job_id ? String(source_job_id) : null,
    source_family: source_family || SOURCE_FAMILIES.RSS,
    source: source_id || 'src-live',
    is_demo_record: false,
    discovered_at: new Date().toISOString(),
    ...extra,
  };
}

// ─── Greenhouse Adapter ───────────────────────────────────────────────────────

/**
 * Fetch jobs from a Greenhouse public board.
 * Board token is the slug from https://boards.greenhouse.io/{boardToken}
 *
 * API: https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs
 * Docs: https://developers.greenhouse.io/job-board.html
 * Auth: None required for public boards.
 */
export async function fetchGreenhouseJobs(boardToken, sourceId) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const data = await fetchJSON(url);
  const jobs = data.jobs || [];

  return jobs.map(j => normaliseJob({
    title: j.title,
    company: boardToken, // Greenhouse boards are per-company
    description: j.content ? stripHtml(j.content) : (j.metadata ? JSON.stringify(j.metadata) : ''),
    location: j.location?.name || '',
    canonical_job_url: j.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${j.id}`,
    application_url: j.absolute_url || null,
    source_job_id: String(j.id),
    source_family: SOURCE_FAMILIES.GREENHOUSE,
    source_id: sourceId || 'src-greenhouse-boards',
  }));
}

// ─── Lever Adapter ────────────────────────────────────────────────────────────

/**
 * Fetch jobs from a Lever public postings page.
 * Site slug is from https://jobs.lever.co/{siteSlug}
 *
 * API: https://api.lever.co/v0/postings/{siteSlug}?mode=json
 * Auth: None required for public postings.
 */
export async function fetchLeverJobs(siteSlug, sourceId) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(siteSlug)}?mode=json`;
  const jobs = await fetchJSON(url);
  if (!Array.isArray(jobs)) return [];

  return jobs.map(j => normaliseJob({
    title: j.text,
    company: siteSlug,
    description: [
      j.descriptionPlain || '',
      (j.lists || []).map(l => `${l.text}: ${l.content}`).join('\n'),
      j.additionalPlain || '',
    ].filter(Boolean).join('\n\n'),
    location: j.categories?.location || '',
    canonical_job_url: j.hostedUrl || `https://jobs.lever.co/${siteSlug}/${j.id}`,
    application_url: j.applyUrl || j.hostedUrl || null,
    source_job_id: j.id,
    source_family: SOURCE_FAMILIES.LEVER,
    source_id: sourceId || 'src-lever-boards',
  }));
}

// ─── USAJobs Adapter ──────────────────────────────────────────────────────────

/**
 * Search the USAJobs API for matching roles.
 *
 * Requires:
 *   - USAJOBS_API_KEY env var (register at https://developer.usajobs.gov/)
 *   - USAJOBS_USER_AGENT env var (must be your registered email)
 *
 * Must be used within USAJobs API Terms of Service:
 *   - Do not store data beyond session
 *   - Do not cache for more than 24h
 *   - Do not represent USAJobs data as your own
 *
 * Default query: "project manager" in information technology series
 */
export async function fetchUSAJobsRoles(searchKeyword, maxResults, sourceId) {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;

  if (!apiKey || !userAgent) {
    throw new Error('USAJOBS_API_KEY and USAJOBS_USER_AGENT env vars required for USAJobs source.');
  }

  const keyword = encodeURIComponent(searchKeyword || 'project manager');
  const url = `https://data.usajobs.gov/api/search?Keyword=${keyword}&ResultsPerPage=${maxResults || 25}&JobCategoryCode=2210`;

  const data = await fetchJSON(url, {
    headers: {
      'Authorization-Key': apiKey,
      'User-Agent': userAgent,
      'Host': 'data.usajobs.gov',
    },
  });

  const items = data?.SearchResult?.SearchResultItems || [];
  return items.map(item => {
    const j = item.MatchedObjectDescriptor;
    return normaliseJob({
      title: j.PositionTitle,
      company: j.OrganizationName || j.DepartmentName || 'Federal Agency',
      description: j.UserArea?.Details?.JobSummary || j.QualificationSummary || '',
      location: (j.PositionLocation || []).map(l => l.LocationName).join('; '),
      canonical_job_url: j.PositionURI || null,
      application_url: j.ApplyURI?.[0] || j.PositionURI || null,
      source_job_id: j.PositionID || j.MatchedObjectId,
      source_family: SOURCE_FAMILIES.USAJOBS,
      source_id: sourceId || 'src-usajobs',
    });
  });
}

// ─── RSS / Atom Adapter ───────────────────────────────────────────────────────

/**
 * Fetch jobs from an RSS or Atom feed.
 * Supports standard RSS 2.0 and Atom 1.0 formats.
 * Extracts link (canonical URL), title, description, and author/company.
 */
export async function fetchRSSFeed(feedUrl, sourceFamily, sourceId) {
  const text = await fetchText(feedUrl);
  const jobs = [];

  // Support both <item> (RSS) and <entry> (Atom)
  const pattern = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/gi;
  const itemMatches = text.matchAll(pattern);

  for (const match of itemMatches) {
    const content = match[1];

    const get = (tag) => {
      const m = content.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
        || content.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    // Atom uses <link href="..."/> or <link>...</link>
    const linkHref = content.match(/<link[^>]+href="([^"]+)"/i)?.[1]
      || content.match(/<link[^>]*rel="alternate"[^>]+href="([^"]+)"/i)?.[1]
      || get('link')
      || get('guid');

    const title = get('title');
    if (!title) continue;

    jobs.push(normaliseJob({
      title,
      company: get('author') || get('dc:creator') || '',
      description: stripHtml(get('description') || get('summary') || get('content') || ''),
      location: get('location') || '',
      canonical_job_url: linkHref || null,
      application_url: linkHref || null,
      source_job_id: get('guid') || linkHref || null,
      source_family: sourceFamily || SOURCE_FAMILIES.RSS,
      source_id: sourceId || 'src-rss',
    }));
  }

  return jobs;
}

// ─── Discovery Runner ─────────────────────────────────────────────────────────

/**
 * Run discovery for a given source configuration.
 * Returns normalised, profile-filtered jobs ready for intake pipeline.
 *
 * source: { id, sourceFamily, url, type, ... }
 * config: { greenhouseBoards, leverBoards, usajobsKeyword, maxResults, discoveryProfile }
 */
export async function discoverJobsForSource(source, config = {}) {
  const {
    greenhouseBoards = [],
    leverBoards = [],
    usajobsKeyword = 'project manager',
    maxResults = 25,
    discoveryProfile = DEFAULT_DISCOVERY_PROFILE,
  } = config;

  // Per-board cap: prevent a single busy board from flooding the run.
  // Each board gets at most this many raw (pre-filter) results before merging.
  const globalMax = discoveryProfile.maxRecordsPerRun || 50;
  const computePerBoardCap = (boardCount) => Math.max(10, Math.ceil(globalMax / Math.max(1, boardCount)));

  let rawJobs = [];

  if (source.sourceFamily === SOURCE_FAMILIES.GREENHOUSE) {
    const perBoardCap = computePerBoardCap(greenhouseBoards.length);
    for (const boardToken of greenhouseBoards) {
      const jobs = await fetchGreenhouseJobs(boardToken, source.id);
      rawJobs.push(...jobs.slice(0, perBoardCap));
    }
  } else if (source.sourceFamily === SOURCE_FAMILIES.LEVER) {
    const perBoardCap = computePerBoardCap(leverBoards.length);
    for (const siteSlug of leverBoards) {
      const jobs = await fetchLeverJobs(siteSlug, source.id);
      rawJobs.push(...jobs.slice(0, perBoardCap));
    }
  } else if (source.sourceFamily === SOURCE_FAMILIES.USAJOBS) {
    rawJobs = await fetchUSAJobsRoles(usajobsKeyword, maxResults, source.id);
  } else if (source.url) {
    rawJobs = await fetchRSSFeed(source.url, source.sourceFamily || SOURCE_FAMILIES.RSS, source.id);
  }

  // Apply discovery profile filter
  const filtered = rawJobs.filter(j => passesDiscoveryProfile(j, discoveryProfile));

  // Cap to maxRecordsPerRun
  return filtered.slice(0, discoveryProfile.maxRecordsPerRun || 50);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags and decode common HTML entities.
 * Used to convert HTML job descriptions to plain text.
 */
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{3,}/g, '  ')
    .trim();
}
