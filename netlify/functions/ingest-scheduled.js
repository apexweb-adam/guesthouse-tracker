/**
 * Netlify Scheduled Function: ingest-scheduled
 *
 * Runs on a schedule (default: every 2 hours) to process approved live sources.
 * Live intake is blocked unless LIVE_INTAKE_ENABLED=true.
 *
 * This function orchestrates but does NOT re-implement scoring logic.
 * All scoring happens via processBatch in db.js which calls scoring.js.
 *
 * Schedule: every 2 hours (configurable via netlify.toml)
 */

import { schedule } from '@netlify/functions';
import { listSources, processBatch, logIngestion, isDemoMode } from './_shared/db.js';
import { canSourceRunLive, SOURCE_TYPES, mergeWithDefaults } from './_shared/sources.js';

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

  for (const source of liveSources) {
    const startedAt = new Date().toISOString();
    let jobs = [];
    let fetchError = null;

    try {
      if (source.type === SOURCE_TYPES.RSS) {
        jobs = await fetchRSSJobs(source);
      }
      // Additional source types (API, email) would be handled here
    } catch (err) {
      fetchError = err.message;
    }

    if (fetchError || !jobs.length) {
      await logIngestion({
        source_id: source.id,
        count_discovered: 0,
        count_deduped: 0,
        count_new: 0,
        errors: fetchError ? [fetchError] : ['No jobs returned from source'],
        status: fetchError ? 'failure' : 'success',
      });
      continue;
    }

    const { inserted, deduped, errors } = await processBatch(jobs, source.id);
    await logIngestion({
      source_id: source.id,
      count_discovered: jobs.length,
      count_deduped: deduped.length,
      count_new: inserted.length,
      errors: errors.map(e => e.error || String(e)),
      status: errors.length > 0 && inserted.length === 0 ? 'failure' : errors.length > 0 ? 'partial' : 'success',
    });

    console.log(`[ingest-scheduled] ${source.name}: ${inserted.length} new, ${deduped.length} deduped`);
  }
}

export const handler = schedule('0 */2 * * *', runIngestion);
