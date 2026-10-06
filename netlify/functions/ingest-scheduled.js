/**
 * Netlify Scheduled Function: ingest-scheduled
 *
 * Every 2 hours (netlify.toml) this hands the actual ingestion to the
 * ingest-background function. Scheduled functions stop after 30 seconds,
 * which is not enough to fetch every source and write a few hundred rows;
 * background functions get 15 minutes.
 */

export const handler = async () => {
  const base = process.env.URL;
  const secret = process.env.DISCOVERY_SECRET;
  if (!base || !secret) {
    console.error('[ingest-scheduled] URL or DISCOVERY_SECRET missing — cannot start ingestion');
    return { statusCode: 500, body: 'URL or DISCOVERY_SECRET missing' };
  }
  const res = await fetch(`${base}/.netlify/functions/ingest-background`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  console.log(`[ingest-scheduled] ingest-background responded ${res.status}`);
  return { statusCode: res.status === 202 ? 200 : 502, body: `ingest-background ${res.status}` };
};
