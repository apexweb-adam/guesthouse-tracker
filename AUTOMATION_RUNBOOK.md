# AUTOMATION_RUNBOOK.md

## How to enable or disable live intake

### Global kill switch

**To disable all live intake immediately:**

```bash
# In Netlify dashboard: Site settings → Environment variables
LIVE_INTAKE_ENABLED=false
```

Or via Netlify CLI:
```bash
netlify env:set LIVE_INTAKE_ENABLED false
```

This takes effect on the next function invocation. The sidebar will show `🔴 Live intake OFF`.

**To re-enable:**
```bash
netlify env:set LIVE_INTAKE_ENABLED true
```

### Per-source enable/disable

1. Navigate to **Sources** in the website sidebar
2. Find the source in the table
3. Toggle the enable/disable switch
4. The change takes effect immediately — no restart required

Alternatively via API:
```bash
curl -X PATCH https://your-site.netlify.app/.netlify/functions/sources \
  -H "Content-Type: application/json" \
  -d '{"id": "src-rss-1", "enabled": false}'
```

---

## How to verify source health

**Via the website:**
1. Navigate to **Sources**
2. Each source shows: type, enabled status, trust level, last run, imported count, deduped count, failed count, noisy warning
3. Yellow warning = noisy/problematic source requiring attention

**Via the API:**
```bash
curl https://your-site.netlify.app/.netlify/functions/sources
```

**Via the Reports page:**
1. Navigate to **Reports → Ingestion Health**
2. See per-source summaries and recent log entries

**Via n8n:**
- Workflow `03-source-health.json` runs every 6 hours and emails you about failing sources via Zapier

---

## How to run local/demo-safe mode

Demo mode requires no Supabase credentials and no live source connections. All data is in localStorage.

```bash
# Start in demo mode
VITE_DEMO_MODE=true npm run dev

# Or: simply run without Supabase env vars
npm run dev
```

In demo mode:
- No live sources are polled
- All scoring, dedup, and classification logic still runs (client-side via shared modules)
- Prep packages are generated client-side
- Digests are built from demo data
- Export downloads a local file
- The sidebar shows `🔴 Live intake OFF` + `Demo mode — no backend required`

---

## How to test one source before enabling more

1. Ensure `LIVE_INTAKE_ENABLED=false` (global kill switch OFF)
2. Create or edit one source in the Sources UI with `enabled: true` and `live_capable: true`
3. Temporarily set `LIVE_INTAKE_ENABLED=true`
4. Manually trigger an ingest run:
   ```bash
   curl -X POST https://your-site.netlify.app/.netlify/functions/ingest-scheduled \
     -H "Content-Type: application/json" \
     -d '{"trigger": "manual", "sourceId": "src-rss-1"}'
   ```
5. Check the Sources UI for the updated `last_run`, `imported count`, and `deduped count`
6. Check the Tracker for new opportunities — verify their scores are correct
7. If results look clean: leave the source enabled and consider enabling `LIVE_INTAKE_ENABLED=true` permanently
8. If results are noisy or incorrect: disable the source and review its configuration

---

## How to roll back if a source misbehaves

### If a source floods the database with junk

1. Disable the source immediately via the Sources UI or API
2. Review the ingestion logs for the source (Reports → Ingestion Health)
3. To remove bad records: use the Tracker to reject them individually, or run a bulk delete via Supabase dashboard filtered by `source = 'src-<id>'`
4. Investigate and fix the source config (URL, type, max_records) before re-enabling

### If the wrong scores were applied (logic regression)

1. Do not modify `_shared/scoring.js` without verifying the truth hierarchy tests pass
2. Run `node scripts/verify.js` to confirm all scoring tests pass
3. If a scoring bug was deployed: any affected opportunities can be re-scored by updating them via the API (PATCH with updated fit_score / lane) or by re-ingesting from a backup

### Emergency: disable all automation

```bash
# Disable live intake
netlify env:set LIVE_INTAKE_ENABLED false

# In n8n: deactivate all workflows
# - Go to n8n dashboard
# - Deactivate workflows 01, 02, 03, 04

# In Zapier: pause all Zaps
```

This leaves the website fully functional (manual intake, approval queue, tracker) with no automated background activity.

---

## How to restore from backup

1. Go to **Reports → Ingestion Health** → Export JSON to download a full snapshot
2. Or call: `GET https://your-site.netlify.app/.netlify/functions/export?format=json`
3. If restoring to a fresh Supabase instance:
   - Run the schema migrations (see `supabase/migrations/`)
   - Import the JSON backup via Supabase dashboard or the REST API
   - Re-enable sources and verify scoring

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | No (demo without it) | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No (demo without it) | — | Supabase service role key |
| `LIVE_INTAKE_ENABLED` | No | `false` | Global live intake kill switch |
| `MAX_RECORDS_PER_RUN` | No | `50` | Max records to process per source per ingest run |
| `WEBHOOK_URL` | No | — | Catch-all outbound webhook destination (Zapier URL) |
| `WEBHOOK_URL_NEW_STRONG_FIT` | No | — | Per-event webhook URL override |
| `WEBHOOK_URL_QUEUE_UPDATED` | No | — | Per-event webhook URL override |
| `WEBHOOK_URL_STALE_REMINDER` | No | — | Per-event webhook URL override |
| `WEBHOOK_URL_WEEKLY_SUMMARY` | No | — | Per-event webhook URL override |
| `WEBHOOK_URL_SOURCE_FAILURE` | No | — | Per-event webhook URL override |
| `WEBHOOK_URL_INGESTION_COMPLETE` | No | — | Per-event webhook URL override |
| `WEBHOOK_SECRET` | No | — | Optional shared secret sent as `X-Webhook-Secret` header |
| `N8N_SITE_URL` | n8n only | — | Your Netlify site URL, set in n8n environment variables |
