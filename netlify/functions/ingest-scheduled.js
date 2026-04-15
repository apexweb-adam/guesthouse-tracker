/**
 * Netlify Scheduled Function: ingest-scheduled
 *
 * Runs on a schedule (default: every 2 hours) to process approved live sources.
 * Live intake is blocked unless LIVE_INTAKE_ENABLED=true.
 *
 * This function orchestrates but does NOT re-implement scoring logic.
 * All scoring happens via processBatch in db.js which calls scoring.js.
 *
 * Safety controls:
 *   - LIVE_INTAKE_ENABLED must be "true" (global kill switch)
 *   - Per-source enabled flag must be true
 *   - MAX_RECORDS_PER_RUN cap applied per source (default: 50)
 *
 * Schedule: every 2 hours (configurable via netlify.toml)
 */

import { schedule } from '@netlify/functions';
import { listSources, processBatch, logIngestion, isDemoMode } from './_shared/db.js';
import { canSourceRunLive, SOURCE_TYPES, mergeWithDefaults, DEFAULT_DISCOVERY_PROFILE } from './_shared/sources.js';
import { discoverJobsForSource } from './_shared/jobFinder.js';

const MAX_RECORDS_PER_RUN = parseInt(process.env.MAX_RECORDS_PER_RUN || '50', 10);

async function fetchRSSJobs(source) {
  if (!source.url) return [];

  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'JobSearchOS/1.0 (structured-feed-reader)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Simple RSS item extractor — no XML library needed
    const items = [];
    const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    for (const match of itemMatches) {
      const content = match[1];
      const get = (tag) => {
        const m = content.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'))
          || content.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      items.push({
        title: get('title'),
        url: get('link') || get('guid'),
        description: get('description') || get('summary'),
        company: get('author') || '',
        location: '',
      });
    }
    return items.filter(i => i.title);
  } catch (err) {
    throw new Error(`RSS fetch failed for ${source.name}: ${err.message}`);
  }
}

async function runIngestion() {
  if (isDemoMode()) {
    console.log('[ingest-scheduled] Demo mode — skipping live source ingestion.');
    return;
  }

  const dbSources = await listSources();
  const sources = mergeWithDefaults(dbSources);
  const liveSources = sources.filter(s => canSourceRunLive(s));

  if (!liveSources.length) {
    console.log('[ingest-scheduled] No live-capable sources enabled.');
    return;
  }

  // Resolve job-finder config from env vars
  const config = {
    greenhouseBoards: (process.env.GREENHOUSE_BOARDS || '').split(',').map(s => s.trim()).filter(Boolean),
    leverBoards: (process.env.LEVER_BOARDS || '').split(',').map(s => s.trim()).filter(Boolean),
    usajobsKeyword: process.env.USAJOBS_KEYWORD || 'technical project manager',
    maxResults: MAX_RECORDS_PER_RUN,
    discoveryProfile: DEFAULT_DISCOVERY_PROFILE,
  };

  for (const source of liveSources) {
    const startedAt = new Date().toISOString();
    let jobs = [];
    let fetchError = null;

    try {
      if (source.sourceFamily && source.sourceFamily !== 'rss') {
        // Use the structured job-finder adapter for ATS/API sources
        jobs = await discoverJobsForSource(source, config);
      } else if (source.type === SOURCE_TYPES.RSS) {
        // Legacy RSS fetcher — preserve backward compat
        jobs = await fetchRSSJobs(source);
      }
    } catch (err) {
      fetchError = err.message;
    }

    if (fetchError || !jobs.length) {
      await logIngestion({
        source_id: source.id,
        count_discovered: 0,
        count_deduped: 0,
        count_new: 0,
        count_high_review: 0,
        errors: fetchError ? [fetchError] : ['No jobs returned from source'],
        status: fetchError ? 'failure' : 'success',
      });
      continue;
    }

    // Apply per-run safety cap
    const discovered = jobs.length;
    const capped = jobs.length > MAX_RECORDS_PER_RUN;
    if (capped) {
      console.log(`[ingest-scheduled] ${source.name}: capping ${jobs.length} records to ${MAX_RECORDS_PER_RUN} (MAX_RECORDS_PER_RUN)`);
      jobs = jobs.slice(0, MAX_RECORDS_PER_RUN);
    }

    const { inserted, deduped, errors, high_review } = await processBatch(jobs, source.id);
    await logIngestion({
      source_id: source.id,
      count_discovered: discovered,
      count_deduped: deduped.length,
      count_new: inserted.length,
      count_high_review: high_review,
      errors: errors.map(e => e.error || String(e)),
      status: errors.length > 0 && inserted.length === 0 ? 'failure' : errors.length > 0 ? 'partial' : 'success',
    });

    console.log(`[ingest-scheduled] ${source.name}: ${inserted.length} new, ${deduped.length} deduped, ${high_review} high-review (low-fit)`);
  }
}

export const handler = schedule('0 */2 * * *', runIngestion);
