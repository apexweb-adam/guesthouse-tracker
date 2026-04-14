/**
 * Netlify Function: /webhooks
 *
 * POST { event: string, payload: object }
 *
 * Dispatches structured outbound webhook events to configured URLs.
 * Used by n8n workflows to forward computed data to Zapier or other services.
 *
 * Supported events:
 *   new_strong_fit       → new high-fit opportunity found
 *   queue_updated        → approval queue has pending items
 *   stale_reminder       → stale/ghosted follow-up reminder
 *   weekly_summary       → weekly conversion summary
 *   source_failure       → a source has failures
 *   ingestion_complete   → scheduled ingestion run completed
 *
 * Env vars:
 *   WEBHOOK_URL                      → catch-all destination
 *   WEBHOOK_URL_{EVENT_UPPERCASE}    → per-event destination (overrides catch-all)
 *   WEBHOOK_SECRET                   → optional shared secret (sent as X-Webhook-Secret)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_EVENTS = [
  'new_strong_fit',
  'queue_updated',
  'stale_reminder',
  'weekly_summary',
  'source_failure',
  'ingestion_complete',
  'apply_pack_generated',
  'strong_fit_ready_to_apply',
  'apply_status_changed',
];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

function resolveWebhookUrl(event) {
  const eventKey = event.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return process.env[`WEBHOOK_URL_${eventKey}`] || process.env.WEBHOOK_URL || null;
}

async function dispatch(event, payload) {
  const targetUrl = resolveWebhookUrl(event);
  if (!targetUrl) {
    return { dispatched: false, reason: 'No WEBHOOK_URL configured for this event' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Sent-At': new Date().toISOString(),
  };
  if (process.env.WEBHOOK_SECRET) {
    headers['X-Webhook-Secret'] = process.env.WEBHOOK_SECRET;
  }

  const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });

  const res = await fetch(targetUrl, { method: 'POST', headers, body });
  const ok = res.ok;

  return {
    dispatched: ok,
    statusCode: res.status,
    targetUrl,
  };
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

  const { event: webhookEvent, payload = {} } = body;

  if (!webhookEvent) return json(400, { error: 'event field is required' });
  if (!VALID_EVENTS.includes(webhookEvent)) {
    return json(400, { error: `Unknown event. Valid events: ${VALID_EVENTS.join(', ')}` });
  }

  try {
    const result = await dispatch(webhookEvent, payload);
    return json(200, { result, event: webhookEvent });
  } catch (err) {
    console.error('[webhooks] dispatch error:', err);
    return json(500, { error: err.message, event: webhookEvent });
  }
};
