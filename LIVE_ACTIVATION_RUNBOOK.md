# Live Intake Activation Runbook

**Product:** AI Job Search OS — Sample Candidate

**Current source priority (operating truth as of this version):**
- **Lever** — Primary source. Consistently higher signal for TPM/Delivery lanes.
- **Greenhouse** — Secondary source. Active but more saturated; used alongside Lever.
- **RSS** — Staged off. Do not activate yet.
- **USAJobs** — Staged off. Do not activate without a separate decision.
- **LinkedIn** — Manual reference only. Not automated.

> ⚠️ **Netlify quota note:** If your Netlify account returns `503 usage_exceeded` on function calls, do NOT enable scheduled automation. See §10 (Post-Quota Next Steps) before enabling any n8n schedules.

This runbook covers:
- [Pre-Activation Prerequisites](#1-pre-activation-prerequisites)
- [Step-by-Step Activation Order](#2-step-by-step-activation-order)
- [First Live Source: Greenhouse Rollout](#3-first-live-source-greenhouse-rollout)
- [End-to-End Live Verification Checklist](#4-end-to-end-live-verification-checklist)
- [n8n Workflow Activation](#5-n8n-workflow-activation)
- [Manual Discovery Run](#5b-manual-discovery-run-first-run-procedure)
- [Source Health Verification](#6-source-health-verification)
- [Kill Switch / Rollback](#7-kill-switch--rollback)
- [What Remains Manual](#8-what-remains-manual)
- [Recommended Env Vars Reference](#9-recommended-env-vars-reference)
- [Post-Quota Next Steps](#10-post-quota-next-steps)

---

## 1. Pre-Activation Prerequisites

Complete these steps **before** setting `LIVE_INTAKE_ENABLED=true`.

### 1a. Supabase Schema — All 4 Migrations Required

Run all migrations in order in the Supabase SQL Editor. Each is idempotent (safe to re-run).

| # | File | Creates / Adds |
|---|---|---|
| 1 | `supabase/migrations/001_discovery_fields.sql` | Discovery columns on `opportunities` |
| 2 | `supabase/migrations/002_ingestion_logs_table.sql` | `ingestion_logs` table |
| 3 | `supabase/migrations/003_user_preferences.sql` | `user_preferences` table |
| 4 | `supabase/migrations/004_readiness_history.sql` | `readiness_history` table |

**Run order:**
```
001 → 002 → 003 → 004
```

**After running, verify in Supabase SQL Editor:**
```sql
-- Check all required discovery columns on opportunities
SELECT column_name FROM information_schema.columns
WHERE table_name = 'opportunities'
  AND column_name IN (
    'canonical_job_url','application_url','source_family',
    'source_job_id','is_demo_record','discovered_at','discovery_source_id'
  );
-- Expected: 7 rows

-- Check required tables exist
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('ingestion_logs','user_preferences','readiness_history');
-- Expected: 3 rows

-- Check ingestion_logs has required columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ingestion_logs'
  AND column_name IN ('count_discovered','count_new','count_deduped','count_high_review','status');
-- Expected: 5 rows

-- Check readiness_history has required columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'readiness_history'
  AND column_name IN ('id','opportunity_id','event_type','payload','recorded_at');
-- Expected: 5 rows
```

**Go / No-Go after migrations:**
- ✅ GO: All 4 SQL blocks run without error; verification queries return expected row counts
- ❌ NO-GO: Any SQL error; any expected row count short; column missing — do not proceed

**Likely migration failure points:**
- `opportunities` table not yet created — make sure your base schema (from Supabase initial setup) exists first
- Running 004 before 003 — always run in order; both are independently safe but 003 should exist first for consistency
- Re-running 001 on a schema that already has the columns — safe, all blocks use `IF NOT EXISTS`

### 1b. Netlify Environment Variables

Set **all** of these in Netlify UI → Site settings → Environment variables:

| Variable | Value | Notes |
|---|---|---|
| `VITE_DEMO_MODE` | `false` | Switches frontend to live backend mode |
| `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Server-side only — never in frontend |
| `SUPABASE_ANON_KEY` | `eyJ...` | For browser-safe queries |
| `LIVE_INTAKE_ENABLED` | `false` | Keep OFF until Step 5 of activation order |
| `DISCOVERY_SECRET` | 32+ char random string | Required for POST /discover auth. Generate: `openssl rand -hex 32` |
| `MAX_RECORDS_PER_RUN` | `50` | Conservative per-run cap — do not raise until source quality is proven |
| `GREENHOUSE_BOARDS` | e.g. `atlassian,servicenow` | Comma-separated board tokens. Set before enabling the source. |

Do **not** set `LIVE_INTAKE_ENABLED=true` yet — that happens after auth is verified.

### 1c. Verify Demo Mode is Off

After deploying with `VITE_DEMO_MODE=false`:

- [ ] Site header shows NO demo badge
- [ ] Dashboard loads from Supabase (empty or real data)
- [ ] Manual intake (add a test record) → appears in Supabase `opportunities` table
- [ ] Approve the test record → `approval_state = approved` in Supabase
- [ ] Delete or reject the test record
- [ ] Run `node scripts/verify.js` locally — all tests should pass

### 1d. Verify /discover Auth

Test that the auth gate is working before enabling live sources.

**Test 1 — No auth header (must return 401):**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401
```

**Test 2 — Wrong secret (must return 401):**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: wrong-secret" \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401
```

**Test 3 — Correct secret (must return 200, intake still disabled):**
```bash
curl -s \
  -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: your-actual-secret" \
  -H "Content-Type: application/json" -d '{}'
# Expected HTTP 200 with body:
# {"ok":false,"message":"Live intake is disabled..."}
```

**Go / No-Go after auth check:**
- ✅ GO: Tests 1 and 2 return 401. Test 3 returns 200 with disabled message (not a crash).
- ❌ NO-GO: Any test returns 500; Test 3 crashes; Test 1 or 2 returns 200 — do not enable live intake.

---

## 2. Step-by-Step Activation Order

Follow this **exact** order:

1. **Apply all 4 Supabase migrations** — see §1a
2. **Set all required env vars** in Netlify — see §1b (keep `LIVE_INTAKE_ENABLED=false`)
3. **Redeploy** — `netlify deploy --prod` or trigger via GitHub push
4. **Verify demo mode is off** — site loads live data, no demo badge
5. **Test /discover auth** — 401 without secret, 200 (disabled) with secret — see §1d
6. **Verify Greenhouse board tokens** — visit each board URL to confirm they exist and have relevant roles
7. **Set `GREENHOUSE_BOARDS` env var** — e.g. `GREENHOUSE_BOARDS=atlassian,servicenow` (start with 2–3 max)
8. **Redeploy** with new env var
9. **Enable the Greenhouse source** — Sources page → "Enable" or API call
10. **Set `LIVE_INTAKE_ENABLED=true`** in Netlify env vars
11. **Redeploy** (env var changes require a new deploy to take effect)
12. **Trigger a manual discovery run** — see §5b
13. **Verify first-run queue quality** — see §4
14. **Run discovery a second time** — verify dedup works — see §5b
15. **Monitor for 48h** before enabling n8n scheduled discovery
16. **Enable n8n workflows** — see §5 (in order: 05 → 06 → 07)

---

## 3. First Live Source: Greenhouse Rollout

**Greenhouse was the first live source activated.** It is a solid, stable secondary source. Lever has since been proven as the higher-signal primary source — see LEVER_ROLLOUT_RUNBOOK.md for Lever-specific guidance.

Greenhouse is still active and worthwhile as a secondary source. This section documents the Greenhouse rollout process for operators who haven't yet activated it, or who want to understand the architecture.

**Why Greenhouse (as a secondary source):**
- Public board API, no auth required
- Structured JSON with reliable job IDs (dedup by `source_job_id`)
- Deterministic `canonical_job_url` (boards.greenhouse.io/…)
- More saturated market, but still produces TPM/Delivery roles

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

## 5. n8n Workflow Activation

**Prerequisite:** Manual discovery run must succeed (§5b) before enabling any n8n schedule.

These are the three n8n workflows to import and activate. **Import in order.**

### Workflow Files (in `n8n/workflows/`)

| File | Purpose | When to activate |
|---|---|---|
| `05-job-discovery.json` | Scheduled discovery (every 6h) + manual trigger | After manual /discover test succeeds |
| `06-daily-approval-digest.json` | Daily approval queue digest | After first live role appears in queue |
| `07-weekly-readiness-summary.json` | Weekly readiness summary | After system is stable (day 3+) |

---

### A. 05-job-discovery.json — Idiot-Proof Activation Checklist

**Goal:** Call `/discover` with the correct auth. No duplicated scoring/classification logic.

**Prerequisites before importing:**
- [ ] SITE_URL is known
- [ ] DISCOVERY_SECRET is known (same value as set in Netlify)
- [ ] Manual discovery run from §5b has already succeeded at least once

**Activation steps:**

1. Open n8n
2. Go to **Workflows → New → Import from file**
3. Import `n8n/workflows/05-job-discovery.json`
4. Open the workflow
5. Go to **Settings → Variables** in n8n and confirm:
   - `SITE_URL` = `https://your-site.netlify.app`
   - `DISCOVERY_SECRET` = same value as your Netlify `DISCOVERY_SECRET`
6. Inspect the **POST /discover** node:
   - URL should be `{{ $env.SITE_URL }}/.netlify/functions/discover`
   - Header `X-Discovery-Secret` should be `{{ $env.DISCOVERY_SECRET }}`
   - No scoring, classification, or dedup logic should appear in any node
7. **Do NOT enable the schedule yet**
8. Click **Execute Workflow** (manual trigger) to test once
9. Check the output of **Log Discovery Result** node:
   - `ok: true`, `sources_run >= 1`
   - If `ok: false` with message `"Live intake is disabled"` → check `LIVE_INTAKE_ENABLED=true` in Netlify
   - If `status: 401` → check `DISCOVERY_SECRET` matches exactly in both n8n and Netlify

**After successful manual run:**
10. Verify in the app:
    - [ ] New roles visible in Discovered Jobs / Approval Queue
    - [ ] No duplicate records from the manual run already done in §5b
    - [ ] `/sources` shows `success` status for Greenhouse

**Run manually a second time to verify dedup:**
11. Click **Execute Workflow** again
12. Verify **Log Discovery Result** shows `total_ingested: 0` (or near 0)
    - If ingested > 0 again: dedup may be broken — check `processBatch` in `db.js` before enabling schedule

**Only after both manual runs pass:**
13. Enable the **Schedule Trigger** node (toggle active)
14. Default schedule: every 6 hours. Adjust if needed.

**Failure signs — stop and investigate:**
- 401 on every call → `DISCOVERY_SECRET` mismatch
- 500 errors → Supabase connection or migration issue
- `ingested` stays at 0 on first run → `LIVE_INTAKE_ENABLED` not `true` or `GREENHOUSE_BOARDS` empty
- `ingested` equal on 1st and 2nd run → dedup broken

**Rollback this workflow:**
- Toggle workflow inactive in n8n
- This immediately stops scheduled discovery — does not affect Netlify env or DB

---

### B. 06-daily-approval-digest.json — Activation Checklist

**Goal:** Fetch and format the daily approval queue summary. Does not duplicate business logic.

**Prerequisites:**
- [ ] SITE_URL is set in n8n
- [ ] At least one live role exists in the approval queue

**Activation steps:**

1. Go to **Workflows → New → Import from file**
2. Import `n8n/workflows/06-daily-approval-digest.json`
3. Confirm `SITE_URL` is set in n8n variables
4. **No DISCOVERY_SECRET needed** — digest endpoint is read-only
5. Inspect the **GET Approval Digest** node:
   - URL should be `{{ $env.SITE_URL }}/.netlify/functions/digest?type=approval`
   - No scoring or classification logic in any node
6. Click **Execute Workflow** manually once
7. Check the **Format Digest Message** or **No pending (skip)** node output:
   - Counts should match what you see in the Approval Queue UI
   - If `totalPending` = 0 when the queue is not empty → `/digest?type=approval` endpoint issue

**After verifying manually:**
8. Connect the last node to your notification channel (Slack / email / webhook)
9. Enable the schedule (default: every 24h)

**Failure signs — stop and investigate:**
- HTTP error on digest endpoint → check Supabase connection
- Counts wildly different from UI → investigate `digest.js` function
- Empty digest when queue is full → authorization or DB read issue

**Rollback:** Toggle workflow inactive in n8n.

---

### C. 07-weekly-readiness-summary.json — Activation Checklist

**Goal:** Fetch the weekly readiness summary. Does not duplicate readiness scoring logic.

**Prerequisites:**
- [ ] SITE_URL is set in n8n
- [ ] System has been running for at least 3 days with real data

**Activation steps:**

1. Go to **Workflows → New → Import from file**
2. Import `n8n/workflows/07-weekly-readiness-summary.json`
3. Confirm `SITE_URL` is set in n8n variables
4. **No DISCOVERY_SECRET needed**
5. Inspect the **GET Weekly Digest** node:
   - URL should be `{{ $env.SITE_URL }}/.netlify/functions/digest?type=weekly`
6. Click **Execute Workflow** manually once
7. Check the **Format Weekly Summary** node output:
   - Readiness counts should match the Reports / Readiness Panel in the app
   - If counts are zero when the app shows data → digest endpoint issue
   - All scoring/readiness logic runs server-side — n8n only formats the output

**After verifying manually:**
8. Connect the last node to your notification channel
9. Enable the weekly schedule

**Failure signs — stop and investigate:**
- Zero counts when app shows real data → `digest.js` weekly type issue
- Readiness data doesn't match app → scoring drift or DB read issue

**Rollback:** Toggle workflow inactive in n8n.

---

### Architecture Note

n8n workflows call Netlify functions only. They do NOT contain scoring, dedup, or classification logic. All business logic lives in `_shared/scoring.js`, `_shared/dedup.js`, and `_shared/readiness.js`. n8n is an orchestration-only layer.

### n8n Environment Variables

Set these in n8n Settings → Variables (not in Netlify):

```
SITE_URL=https://your-site.netlify.app
DISCOVERY_SECRET=<same value as set in Netlify DISCOVERY_SECRET>
```

`DISCOVERY_SECRET` is required for workflow 05 only. Workflows 06 and 07 only need `SITE_URL`.

---

## 5b. Manual Discovery Run (first run procedure)

Before enabling scheduled n8n discovery, run the first discovery manually to verify the system:

### Using the helper script

```bash
export SITE_URL=https://your-site.netlify.app
export DISCOVERY_SECRET=your-secret-here

# Run discovery for all enabled live sources
./scripts/run-discovery.sh

# Or for a single source
./scripts/run-discovery.sh src-greenhouse-boards
```

### Using curl directly

```bash
# Run all enabled sources
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'

# Run Greenhouse specifically
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"src-greenhouse-boards"}'
```

### What a successful response looks like

```json
{
  "ok": true,
  "mode": "live",
  "sources_run": 1,
  "total_discovered": 42,
  "total_ingested": 12,
  "total_recommended": 8,
  "results": [
    {
      "source_id": "src-greenhouse-boards",
      "discovered": 42,
      "ingested": 12,
      "deduped": 0,
      "high_review": 4,
      "error": null
    }
  ]
}
```

### Post-run validation checklist

After the first successful discovery run, check these pages:

- [ ] `/tracker` → Approval Queue tab — new pending roles should appear
- [ ] Each queued role has a real `canonical_job_url` (opens correct posting)
- [ ] Fit scores look reasonable (TPM/Delivery roles should score 60–100)
- [ ] Low-fit Ops-only roles show with lower scores and `high_review: true`
- [ ] Approve 1–2 strong roles → Apply Pack generates correctly
- [ ] Apply Pack has real URL in "Open Original Posting" button
- [ ] `/sources` page shows last run timestamp and `success` status
- [ ] Run `./scripts/check-live.sh` to confirm all API gates are healthy

### Second-run dedup test

Run discovery a second time within the same session:

```bash
./scripts/run-discovery.sh
```

**Dedup success looks like:**
- `total_ingested: 0` (or very low if new jobs actually posted between runs)
- Response field `deduped > 0` — records were recognised as duplicates by `source_job_id` or hash
- `/sources` page shows `Deduped` count incremented

**Dedup failure looks like:**
- `total_ingested` equals (or nearly equals) the first run count
- The same job titles appearing twice in the Approval Queue
- Response shows `deduped: 0` and `ingested > 0` — all records treated as new

If dedup is broken: set `LIVE_INTAKE_ENABLED=false`, investigate `processBatch` in `db.js`, do not enable n8n.

---

## 6. Source Health Verification

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

## 7. Kill Switch / Rollback

### Rollback triggers — when to activate the kill switch

Stop immediately if any of these occur:
- Approval queue flooding with generic Ops-only roles not matching TPM/Delivery hierarchy
- Second run `total_ingested` equals first run (dedup broken)
- Bad URLs — `canonical_job_url` is null or doesn't open
- Repeated source errors or 500s in ingestion logs
- Apply Pack generating malformed output on live-discovered roles
- Any auth bypass allowing unauthenticated /discover calls

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

Verify kill switch is active:
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/discover \
  -H "X-Discovery-Secret: your-secret-here" \
  -H "Content-Type: application/json" -d '{}'
# Expected: {"ok":false,"message":"Live intake is disabled..."}
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

### Stop n8n Scheduled Discovery

1. Open n8n → Workflows → `05 — Job Discovery Run`
2. Toggle the workflow **inactive**

This stops all scheduled discovery immediately. Manual runs in the app still work.

### Revert to Demo Mode

```
Netlify → VITE_DEMO_MODE → true → Redeploy
```

Effect: frontend switches to demo localStorage mode. Backend functions still work but frontend uses demo data. Use this only for testing, not for production rollback.

### Remove Discovered Records (if bad data ingested)

Always preview before deleting. Only delete `pending` records — never approved.

In Supabase SQL Editor:
```sql
-- Step 1: Preview — confirm what you are about to remove
SELECT id, title, company, source_family, discovered_at, approval_state
FROM opportunities
WHERE source_family = 'greenhouse'
  AND approval_state = 'pending'
  AND discovered_at > 'YYYY-MM-DD'   -- replace with the date of the bad run
ORDER BY discovered_at DESC;

-- Step 2: Delete ONLY pending discovered records from the bad run date
-- IMPORTANT: approval_state = 'pending' guard prevents deleting approved records
DELETE FROM opportunities
WHERE source_family = 'greenhouse'
  AND approval_state = 'pending'
  AND discovered_at > 'YYYY-MM-DD';

-- Step 3: Verify — approved records untouched
SELECT COUNT(*) FROM opportunities
WHERE approval_state = 'approved';
-- This count should be unchanged
```

> **Never delete approved records.** The approval gate is an intentional safeguard.

---

## 8. What Remains Manual

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

## 9. Recommended Env Vars Reference

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

### Required for Lever (primary source)

```bash
# Comma-separated company slugs — use verified slugs only
# Verified working: aerostrat, thinkahead, immutable
LEVER_BOARDS=aerostrat,thinkahead,immutable
```

No auth required — public postings API. For more slugs, see LEVER_ROLLOUT_RUNBOOK.md §2.

### Required for Greenhouse (secondary source)

```bash
# Comma-separated board tokens — add after verifying each token exists
GREENHOUSE_BOARDS=atlassian,servicenow
```

No auth required — these are public job boards.

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

---

## Daily Operations

### Daily Schedule

The job discovery workflow (n8n `05-job-discovery.json`) runs automatically once per day at **7am UTC**.
This replaces the previous every-6-hours schedule to reduce noise and align with a morning review cadence.

### Manual Daily Run

To trigger discovery manually:

```bash
# Run all enabled sources
./scripts/run-discovery.sh

# Or via curl directly
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Source-Specific Runs

Run only Greenhouse sources:
```bash
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"src-greenhouse-boards"}'
```

Run only Lever sources:
```bash
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"src-lever-boards"}'
```

Run all sources of a specific source family:
```bash
curl -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceFamily":"greenhouse"}'
```

### Daily Check

After the morning run, review:

1. `/discover` result: check `total_ingested`, `total_discovered`, `results` per source
2. Daily digest: `GET /digest?type=daily` — shows per-source-family breakdown, high-fit roles, approval queue status

```bash
curl https://YOUR_SITE/.netlify/functions/digest?type=daily
```

### Daily Quality Checks

| Observation | Diagnosis | Action |
|---|---|---|
| `total_ingested: 0` and discovery ran OK | Dedup working — roles already in DB | Normal, no action |
| New roles appearing with `fit_score < 50` | Source quality issue | Check source config; consider tightening discovery profile |
| `approval_needed` count growing each day | Approval queue backing up | Review and approve/reject pending roles in Dashboard |
| `blocked_by_missing_url > 0` | Approved roles missing application URL | Add URLs manually before applying |

### Live Intake Control

To disable all live intake:
```
LIVE_INTAKE_ENABLED=false  ← set in Netlify env → Redeploy
```

This blocks ALL automated source ingestion. Manual and CSV intake remain available.

### What Are the Best Jobs That Arrived Today?

**Option 1:** Dashboard → **Best New Roles** panel — shows pending roles with `NEW TODAY` badge for roles ingested in the last 24h, ranked by fit score.

**Option 2:** Run the daily digest and check `high_fit_roles`:
```bash
curl "https://YOUR_SITE/.netlify/functions/digest?type=daily"
# → digest.high_fit_roles — top fit_score >= 85 roles from today
# → digest.per_source_family — breakdown by source
# → digest.approval_needed — count needing review
```

---

## 10. Post-Quota Next Steps

> **When to use:** Only after confirming Netlify Functions no longer return `503 usage_exceeded`. Do not enable any scheduled automation while quota is exhausted.

### What `503 usage_exceeded` means

Netlify Free tier limits monthly function invocations. When exhausted, all Netlify Functions return HTTP 503. This affects `/discover`, all API endpoints, and all n8n-triggered workflows.

**This is a Netlify account plan issue — not a code bug.** Options to resolve:
- Wait for the monthly quota to reset (check Netlify dashboard for reset date)
- Upgrade to Netlify Pro for higher function limits

### Confirm quota is resolved before scheduling

```bash
# Should return 200 (or 401 if wrong secret), NOT 503
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

- `200` or `401` → quota OK, safe to proceed
- `503` → quota still exhausted — **do not proceed with scheduling**

### Lever-first post-quota sequence (in order)

Follow this **exact** sequence:

1. Confirm curl test above returns 200/401, not 503
2. Run one real Lever discovery through the deployed endpoint:
   ```bash
   curl -X POST https://YOUR_SITE/.netlify/functions/discover \
     -H "X-Discovery-Secret: YOUR_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"sourceId":"src-lever-boards"}'
   ```
   Expected: `ok: true`, `total_ingested > 0`, no errors
3. Approve one real Lever role through the live app
4. Verify Apply Pack generation through the live path — confirm the Apply Pack URL links to `jobs.lever.co/...`
5. Only then enable the n8n daily schedule (workflow `05-job-discovery.json` at 7am UTC)
6. Compare Lever vs Greenhouse quality over 24–48 hours via Reports → Source Quality
7. Only after that consider any additional source — but do not activate RSS or USAJobs without a separate decision

### What remains off (do not activate without a separate decision)

| Source | Status | Reason |
|---|---|---|
| RSS / Atom feeds | Staged off | Code exists; not activated — quality not yet evaluated |
| USAJobs | Staged off | Code exists; requires `USAJOBS_API_KEY`; not needed yet |
| LinkedIn | Manual only | Not automated — not scraping, not ever |

