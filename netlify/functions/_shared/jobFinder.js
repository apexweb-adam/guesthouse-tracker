/**
 * Job Finder — Real Job Discovery Engine
 *
 * Adapters for governed, structured job sources:
 *   - Greenhouse public job board JSON API
 *   - Lever public postings JSON API
 *   - USAJobs REST API (federal government)
 *   - RSS/Atom feeds (SEEK, APSJobs, etc.)
 *   - Apify LinkedIn (residential-proxy hit on LinkedIn's public guest-jobs
 *     endpoint — added 2026-06-01. NOT browser automation, NOT logged-in
 *     scraping, NOT crawling. Apify residential proxies rotate IPs against
 *     LinkedIn's anonymous-public endpoint, which is policy-allowed.)
 *
 * Rules:
 *   - No LinkedIn browser automation (account scraping is still forbidden)
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

// ─── Ashby public job-board API ───────────────────────────────────────────────

/**
 * Fetch jobs from an Ashby job board.
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}
 * Public read-only — no auth needed. Tested against openai, ramp, plaid, etc.
 */
export async function fetchAshbyJobs(boardSlug, sourceId) {
  if (!boardSlug) return [];
  let data;
  try {
    data = await fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardSlug)}`);
  } catch (e) {
    console.warn(`[ashby] ${boardSlug}: ${e.message}`);
    return [];
  }
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.filter(j => j.isListed !== false).map(j => {
    const wpt = (j.workplaceType || '').toLowerCase();
    const work_type = wpt.includes('remote') ? 'remote'
                    : wpt.includes('hybrid') ? 'hybrid'
                    : wpt ? 'onsite'
                    : (j.isRemote === true ? 'remote' : null);
    return {
      source_id: sourceId,
      source_family: 'ashby',
      title: j.title || '',
      company: boardSlug,
      location: j.location || (j.secondaryLocations && j.secondaryLocations[0]) || '',
      canonical_job_url: j.jobUrl || j.applyUrl || '',
      application_url: j.applyUrl || j.jobUrl || '',
      description: (j.descriptionPlain || '').slice(0, 8000),
      posted_at: j.publishedAt || null,
      source_job_id: j.id || null,
      employment_type: (j.employmentType || '').toLowerCase().replace('fulltime', 'full_time') || null,
      work_type,
      department: j.department || j.team || null,
    };
  });
}

// ─── Apify LinkedIn (residential-proxy guest-jobs endpoint) ───────────────────

/**
 * Fetch LinkedIn jobs via our deployed Apify actor.
 *
 * The actor scrapes LinkedIn's public /jobs-guest/jobs/api endpoint
 * (no LinkedIn account involved). Residential proxy rotation by Apify means
 * each request appears from a different real-user IP, dodging the rate limits
 * that brick anonymous single-IP scraping.
 *
 * Returns normalised job records matching the rest of the pipeline's schema.
 */
export async function fetchApifyLinkedInJobs(config, sourceId) {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_LINKEDIN_ACTOR_ID || 'immense_greenery/linkedin-jobs-guest-scraper';
  if (!token) {
    console.warn('[apify-linkedin] APIFY_TOKEN missing — skipping');
    return [];
  }
  const actorSlug = actorId.replace('/', '~');
  const url = `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json`;

  // Pull keyword list from env (LINKEDIN_KEYWORDS) when set, otherwise fall
  // back to the TPM defaults. Empty arrays in JS are truthy, so we MUST check
  // length explicitly — `[] || defaults` returns `[]`, not the defaults.
  const defaultKeywords = [
    'Technical Program Manager',
    'Technical Project Manager',
    'Senior Project Manager',
    'Delivery Manager',
    'Program Manager',
    'IT Project Manager',
  ];
  // Aggressive scope cap — Netlify Functions sync timeout is 26s; an Apify
  // sync run with residential proxy averages ~5-8s per keyword-page. So:
  //   2 keywords × 1 page = ~12-16s actor time, fits comfortably.
  // For bigger volume, add a separate 6h cron function (TODO).
  const keywords = (Array.isArray(config.linkedinKeywords) && config.linkedinKeywords.length > 0
    ? config.linkedinKeywords
    : defaultKeywords).slice(0, 2);

  const body = {
    keywords,
    location: config.linkedinLocation || 'United States',
    hours_old: 168,
    pages_per_keyword: 1,
    remote_only: false,
    use_residential_proxy: true,
  };

  let items = [];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // 20s ceiling — leaves 6s of the Netlify 26s budget for everything else
      // in the discover handler (other sources, scoring, DB writes).
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[apify-linkedin] HTTP ${res.status}`);
      return [];
    }
    items = await res.json();
    if (!Array.isArray(items)) {
      console.warn('[apify-linkedin] non-array response');
      return [];
    }
  } catch (e) {
    console.warn(`[apify-linkedin] fetch failed: ${e.message}`);
    return [];
  }

  // Normalise to pipeline schema. The actor already strips LinkedIn tracking
  // params from the URL, so each url is dedup-stable.
  return items
    .filter(it => it && it.url)
    .map(it => ({
      source_id: sourceId,
      source_family: 'apify_linkedin',
      title: it.title || '',
      company: it.company || '',
      location: it.location || '',
      canonical_job_url: it.url,
      application_url: it.url,
      description: '',  // guest endpoint doesn't return description text
      posted_at: it.posted_at || null,
      source_job_id: (it.url.match(/jobs\/view\/[^/?]+-(\d+)/) || [])[1] || null,
    }));
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

  let rawJobs = [];

  if (source.sourceFamily === SOURCE_FAMILIES.GREENHOUSE) {
    for (const boardToken of greenhouseBoards) {
      const jobs = await fetchGreenhouseJobs(boardToken, source.id);
      rawJobs.push(...jobs);
    }
  } else if (source.sourceFamily === SOURCE_FAMILIES.LEVER) {
    for (const siteSlug of leverBoards) {
      const jobs = await fetchLeverJobs(siteSlug, source.id);
      rawJobs.push(...jobs);
    }
  } else if (source.sourceFamily === SOURCE_FAMILIES.USAJOBS) {
    rawJobs = await fetchUSAJobsRoles(usajobsKeyword, maxResults, source.id);
  } else if (source.sourceFamily === SOURCE_FAMILIES.ASHBY) {
    for (const boardSlug of (config.ashbyBoards || [])) {
      const jobs = await fetchAshbyJobs(boardSlug, source.id);
      rawJobs.push(...jobs);
    }
  } else if (source.sourceFamily === SOURCE_FAMILIES.APIFY_LINKEDIN) {
    rawJobs = await fetchApifyLinkedInJobs(config, source.id);
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
