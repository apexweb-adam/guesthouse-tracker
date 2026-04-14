# AUTOMATION_STACK_DECISION.md

## Stack summary

| Tool | Role | Logic ownership |
|---|---|---|
| Netlify Functions / Node.js | Brain — all computation | ✅ Yes |
| n8n | Orchestration backbone — scheduling, triggering | ✅ Calls API only |
| Zapier | Notification convenience layer | ✅ Receives webhooks only |
| Make.com | Not used | — |

---

## What n8n does

n8n is the **primary orchestration backbone**. It does **not** contain any business logic.

| Workflow | Schedule | What it does |
|---|---|---|
| `01-rss-intake.json` | Every 2 hours | Fetches active source list, filters to live-enabled RSS sources, triggers `ingest-scheduled` function per source |
| `02-approval-digest.json` | Daily 08:00 | Fetches approval queue digest + stale digest from API, fires `queue_updated` and `stale_reminder` webhook events if items exist |
| `03-source-health.json` | Every 6 hours | Fetches source health from API, fires `source_failure` webhook for any sources with failures or noisy warnings |
| `04-weekly-summary.json` | Monday 09:00 | Fetches weekly digest, fires `weekly_summary` webhook; optional disabled backup node |

**Rules n8n follows:**
- All calls are HTTP requests to Netlify Functions
- n8n never scores, classifies, or recommends
- n8n never submits applications or sends outreach
- All scheduling is decoupled from business logic

---

## What Zapier does

Zapier is the **convenience notification layer**. It receives webhook events from the API and dispatches human-facing notifications.

| Event | Zapier action |
|---|---|
| `new_strong_fit` | Email / Slack notification with role name and score |
| `queue_updated` | Daily email with pending queue count and top opportunities |
| `stale_reminder` | Email listing stale / ghosted opportunities requiring follow-up |
| `weekly_summary` | Weekly email digest with pipeline funnel stats |
| `source_failure` | Alert email when a source fails health check |

**How to connect:**
1. In Zapier, create a Zap with trigger: **Webhooks by Zapier → Catch Hook**
2. Copy the Zapier webhook URL
3. Set `WEBHOOK_URL=<zapier-url>` in your Netlify environment variables (or per-event: `WEBHOOK_URL_QUEUE_UPDATED=...`)
4. The n8n workflows will fire events → `/webhooks` function → Zapier → your email / Slack

**Zapier does NOT:**
- Compute scores, recommendations, or classifications
- Read from or write to the database
- Send outreach on behalf of the candidate
- Trigger applications

---

## What Make.com does (or does not do)

**Make.com is not used and not needed.**

The API provides all computation. n8n provides scheduling and orchestration. Zapier provides notification dispatch. There is no connector gap that requires Make.

If in the future a source integration is materially easier in Make (e.g. a custom ATS with a specific OAuth flow that n8n doesn't support natively), a Make scenario can be added as an adapter that calls `/intake` — but that is not the case today.

---

## Why this split was chosen

### Why n8n (not Zapier) for orchestration

- n8n supports complex conditional logic in Code nodes (source filtering, kill-switch checking)
- n8n runs on a self-hosted or cloud instance with better scheduling control
- n8n fan-out (one source per iteration) is clean without Zapier plan limitations
- n8n error handling is more controllable

### Why Zapier (not n8n) for notifications

- Zapier has first-class Gmail, Slack, calendar integrations that are trivial to configure
- Zapier is better suited for the candidate's personal notification preferences
- Notifications don't need complex logic — just receive and forward

### Why not make either tool the brain

The only correct brain is the Netlify Functions layer. This ensures:
- All scoring decisions are auditable (they're in one place)
- The truth hierarchy cannot be violated by an external tool
- Logic changes take effect everywhere simultaneously
- The system works even if n8n or Zapier goes offline
