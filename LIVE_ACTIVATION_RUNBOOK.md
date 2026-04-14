# Live Intake Activation Runbook

**Product:** AI Job Search OS — Sample Candidate  
**Branch:** `copilot/inspecting-repo-current-system`

This runbook covers:
- [Pre-Activation Prerequisites](#1-pre-activation-prerequisites)
- [Step-by-Step Activation Order](#2-step-by-step-activation-order)
- [First Live Source: Greenhouse Rollout](#3-first-live-source-greenhouse-rollout)
- [End-to-End Live Verification Checklist](#4-end-to-end-live-verification-checklist)
- [Source Health Verification](#5-source-health-verification)
- [Kill Switch / Rollback](#6-kill-switch--rollback)
- [What Remains Manual](#7-what-remains-manual)
- [Recommended Env Vars Reference](#8-recommended-env-vars-reference)

---

## 1. Pre-Activation Prerequisites

Complete these steps **before** setting `LIVE_INTAKE_ENABLED=true`.

### 1a. Supabase Schema

- [ ] Open your Supabase project → SQL Editor
- [ ] Run `supabase/migrations/001_discovery_fields.sql` (adds discovery columns to `opportunities`)
- [ ] Run `supabase/migrations/002_ingestion_logs_table.sql` (creates `ingestion_logs` table)
- [ ] Verify:
  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'opportunities'
    AND column_name IN ('canonical_job_url','application_url','source_family',
                        'source_job_id','is_demo_record','discovered_at');
  -- Should return 6 rows

  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_name = 'ingestion_logs';
  -- Should return 1
  ```

### 1b. Netlify Environment Variables

Set **all** of these in Netlify UI → Site settings → Environment variables:

| Variable | Value | Notes |
|---|---|---|
| `VITE_DEMO_MODE` | `false` | Switches frontend to live backend mode |
| `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Server-side only — never in frontend |
| `SUPABASE_ANON_KEY` | `eyJ...` | For browser-safe queries |
| `LIVE_INTAKE_ENABLED` | `false` | Keep OFF until Step 3 below |
| `DISCOVERY_SECRET` | 32+ char random string | Required for POST /discover auth |
| `MAX_RECORDS_PER_RUN` | `50` | Conservative cap per run |

Do **not** set `LIVE_INTAKE_ENABLED=true` yet — that happens in Step 3.

### 1c. Verify Demo Mode is Off

After deploying with `VITE_DEMO_MODE=false`:

- [ ] Site header shows NO demo badge
- [ ] Dashboard loads from Supabase (empty or real data)
- [ ] Manual intake (add a test record) → appears in Supabase `opportunities` table
- [ ] Approve the test record → `approval_state = approved` in Supabase
- [ ] Delete or reject the test record
- [ ] Run `node scripts/verify.js` locally — all tests should pass

### 1d. Verify /discover Auth

Test that the auth gate is working before enabling live sources:

```bash
# Should return 401 (no auth header)
curl -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "Content-Type: application/json" -d '{}'

# Should return 200 (live intake disabled, but auth passed)
curl -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: your-secret-here" \
  -H "Content-Type: application/json" -d '{}'
```

Expected response (auth passes but intake disabled):
```json
{"ok":false,"message":"Live intake is disabled. Set LIVE_INTAKE_ENABLED=true to enable real job discovery."}
```

---

## 2. Step-by-Step Activation Order

Follow this exact order:

1. **Apply Supabase migrations** (001 and 002) — see §1a
2. **Set all required env vars** in Netlify — see §1b
3. **Redeploy** — `netlify deploy --prod` or trigger via GitHub
4. **Verify demo mode is off** — site loads live data, no demo badge
5. **Test /discover auth** — 401 without secret, 200 (disabled) with secret
6. **Pick one source** — start with Greenhouse (see §3 below)
7. **Set source boards env var** — e.g. `GREENHOUSE_BOARDS=atlassian,servicenow`
8. **Redeploy** with new env var
9. **Enable the source** in the Sources UI (or via PATCH /sources)
10. **Set `LIVE_INTAKE_ENABLED=true`** in Netlify env vars
11. **Redeploy** (env var changes take effect on next deploy)
12. **Trigger a manual discovery run** — see §4
13. **Verify queue quality** — see §4 and §5
14. **Monitor for 48h** before enabling additional sources

---

## 3. First Live Source: Greenhouse Rollout

**Greenhouse is the recommended first live source** because:
- Public board API, no auth required
- Structured JSON with reliable job IDs (dedup by `source_job_id`)
- Deterministic `canonical_job_url` (boards.greenhouse.io/…)
- High-quality data: real ATS postings, not aggregated noise

### 3a. Find Board Tokens

Go to `https://boards.greenhouse.io/{boardToken}` to confirm the company posts there.

Good starting tokens for Australian TPM/Delivery roles:
- `atlassian` — consistently posts TPM/DM roles
- `servicenow` — Technical PM and Delivery Manager roles
- `thoughtworks` — strong Delivery Manager/Tech Lead postings
- `seek` — internal tech roles (not the job board itself)
- `deloitte` — digital delivery and programme management

> Verify before adding: visit `https://boards-api.greenhouse.io/v1/boards/{token}/jobs` and check for TPM-relevant titles.

### 3b. Configure the Source

In Netlify env vars, set:
```
GREENHOUSE_BOARDS=atlassian,servicenow,thoughtworks
```

Start with 2–3 boards maximum. Add more after verifying queue quality.

### 3c. Enable the Source

One of:
- **UI:** Sources page → click "Enable" next to "Greenhouse Job Boards"
- **API:** `PATCH /.netlify/functions/sources` with `{ "id": "src-greenhouse-boards", "enabled": true }`

### 3d. Activate

```bash
# Set LIVE_INTAKE_ENABLED=true in Netlify, then redeploy
netlify deploy --prod

# Trigger a manual discovery run
curl -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: your-secret-here" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or via Netlify CLI:
```bash
netlify functions:invoke discover --no-identity \
  -H "X-Discovery-Secret=your-secret-here" \
  --payload '{}'
```

### 3e. One-Source-Only Policy

- Do NOT enable SEEK RSS, Lever, or USAJobs simultaneously on first activation
- Enable only Greenhouse until you have verified:
  - At least 2 discovery runs with clean dedup
  - Queue quality ≥ 60% recommended (score ≥ 70)
  - No source errors logged
- Enable one additional source per week, if quality holds

---

## 4. End-to-End Live Verification Checklist

Run after every first-time source activation.

### 4a. First Discovery Run

- [ ] Trigger via curl or Netlify CLI (see §3d)
- [ ] Response includes `ok: true`, `sources_run: 1`, `total_discovered > 0`
- [ ] Response includes `total_ingested > 0`
- [ ] Response includes `total_recommended >= 1` (or `new_strong_fit` event fired)

### 4b. Queue Quality Check

- [ ] Open `/discover` (Discovered Jobs view) — new records visible
- [ ] At least one record has a TPM or Delivery Manager lane badge
- [ ] At least one record has `fit_score >= 70` (recommended badge)
- [ ] No record was auto-approved — all `approval_state = pending`
- [ ] Generic Ops/PM records score < 70 and are NOT recommended

### 4c. Dedup Verification

- [ ] Trigger discovery run a **second time** (same source, same day)
- [ ] Response shows `total_ingested = 0` (all records already exist)
- [ ] Sources page: `Deduped` count increments; `Imported` count unchanged

### 4d. Apply Pack Continuity

- [ ] Approve one strong-fit discovered record from the Discovered view
- [ ] Record transitions to `status = apply_pack_generated`
- [ ] Navigate to `/apply-pack/{id}` — pack loads with correct resume version
- [ ] `canonical_job_url` is populated (real Greenhouse URL, not null)
- [ ] "Open Original Posting" button visible and links to real posting

### 4e. Event Verification (if webhooks configured)

- [ ] `discovery_run_complete` event received after run
- [ ] `new_strong_fit` event received ONLY if recommended records were ingested
- [ ] `apply_pack_generated` event received after approval

---

## 5. Source Health Verification

The Sources page (`/sources`) shows per-source health metrics. Verify after each discovery run:

| Metric | Where to check | Healthy | Warning |
|---|---|---|---|
| Last Run | Sources table → Last Run column | Recent timestamp | Never (not yet run) |
| Last Status | Below Last Run timestamp | `success` | `partial` or `failure` |
| Imported | Sources table → Imported column | > 0 after first run | 0 forever |
| Deduped | Sources table → Deduped column | > 0 on 2nd+ run | 0 always (dedup may be broken) |
| High Review | Sources table → High Review column | < 50% of Imported | > 50% = noisy source |
| Failures | Sources table → Failures column | 0 | > 0 = investigate |
| Noisy Warning | Yellow warning under source name | Not shown | Shown if > 50% low-fit |

**Noisy Source Action:**
- If `High Review / Imported > 0.50` after 10+ records: inspect the board tokens
- Remove boards that are mostly off-hierarchy (ops-only, marketing, etc.)
- Do NOT disable the source entirely — just reduce the board token list

---

## 6. Kill Switch / Rollback

### Fast Kill Switch (live intake OFF, everything else running)

```
Netlify → Site settings → Environment variables → LIVE_INTAKE_ENABLED → change to false → Redeploy
```

Effect:
- All automated source ingestion is blocked immediately after deploy
- Manual intake and CSV still work
- Stale scan still works
- Existing queued records are unaffected
- No data loss

Verify:
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: your-secret-here" \
  -d '{}'
# Response: {"ok":false,"message":"Live intake is disabled..."}
```

### Disable One Source (keep others running)

```
UI: Sources page → click "Disable" next to the source
```

or:
```bash
curl -X PATCH https://your-site.netlify.app/.netlify/functions/sources \
  -H "Content-Type: application/json" \
  -d '{"id":"src-greenhouse-boards","enabled":false}'
```

### Revert to Demo Mode

```
Netlify → VITE_DEMO_MODE → true → Redeploy
```

Effect: frontend switches to demo localStorage mode. Backend functions still work but frontend uses demo data. Use this only for testing, not for production rollback.

### Remove Discovered Records (if bad data ingested)

In Supabase SQL Editor:
```sql
-- Preview before deleting
SELECT id, title, company, source_family, discovered_at
FROM opportunities
WHERE source_family = 'greenhouse'
  AND discovered_at > '2026-04-14'
  AND approval_state = 'pending';

-- Delete only pending discovered records (approved records are NOT affected)
DELETE FROM opportunities
WHERE source_family = 'greenhouse'
  AND discovered_at > '2026-04-14'
  AND approval_state = 'pending';
```

> **Never delete approved records.** The approval gate is an intentional safeguard.

---

## 7. What Remains Manual

The following steps **cannot be automated** from the code repo and require direct account access:

| Step | Account Required | Instructions |
|---|---|---|
| Apply Supabase migrations | Supabase project owner | Run SQL in Supabase SQL Editor |
| Set Netlify env vars | Netlify site admin | Site settings → Environment variables |
| Redeploy after env var changes | Netlify site admin | `netlify deploy --prod` or GitHub push |
| Register USAJobs API key | developer.usajobs.gov account | [https://developer.usajobs.gov/](https://developer.usajobs.gov/) |
| Configure n8n SITE_URL + DISCOVERY_SECRET | n8n instance access | Import `n8n/workflows/05-job-discovery.json` and set env vars in n8n |
| Verify Greenhouse board tokens exist | Browser — public URLs | Visit `https://boards.greenhouse.io/{token}` to confirm |
| Review and approve discovered records | Human operator (Candidate) | `/discover` page in the app |

---

## 8. Recommended Env Vars Reference

### Required for Live Mode

```bash
# Switches off demo mode
VITE_DEMO_MODE=false

# Supabase backend
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Discovery auth — required for POST /discover
# Generate with: openssl rand -hex 32
DISCOVERY_SECRET=<generate-a-strong-secret>

# Global live intake kill switch — set to true ONLY after verification
LIVE_INTAKE_ENABLED=false

# Per-run safety cap
MAX_RECORDS_PER_RUN=50
```

### Required for Greenhouse (first live source)

```bash
# Comma-separated board tokens — add after verifying each token exists
GREENHOUSE_BOARDS=atlassian,servicenow
```

No auth required — these are public job boards.

### Required for Lever (second source, optional)

```bash
# Comma-separated company slugs
LEVER_BOARDS=atlassian,canva
```

No auth required — public postings API.

### Required for USAJobs (US federal — optional)

```bash
USAJOBS_API_KEY=<from developer.usajobs.gov>
USAJOBS_USER_AGENT=<your-registered-email>
USAJOBS_KEYWORD=technical project manager
```

### Optional — Outbound Webhooks

```bash
# Catch-all — receives all events
WEBHOOK_URL=https://hooks.zapier.com/...

# Per-event overrides (optional)
WEBHOOK_URL_NEW_STRONG_FIT=
WEBHOOK_URL_DISCOVERY_RUN_COMPLETE=
WEBHOOK_URL_APPLY_PACK_GENERATED=
WEBHOOK_URL_STRONG_FIT_READY_TO_APPLY=

# Shared secret sent as X-Webhook-Secret header
WEBHOOK_SECRET=
```

### n8n Variables (set inside n8n, not Netlify)

```
SITE_URL=https://your-site.netlify.app
DISCOVERY_SECRET=<same value as Netlify DISCOVERY_SECRET>
```

---

## Quick Reference

```
# Trigger manual discovery (live)
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" -d '{}'

# Trigger single-source discovery
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"src-greenhouse-boards"}'

# Kill live intake immediately
# → Set LIVE_INTAKE_ENABLED=false in Netlify → Redeploy

# Run local verification
node scripts/verify.js
```
