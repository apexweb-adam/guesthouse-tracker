# Lever Rollout Runbook

**Status: Lever is the PRIMARY live discovery source.**
Lever has been proven in live discovery and consistently returns higher-signal results than Greenhouse for TPM and Delivery Manager roles.

**Source priority (current operating truth):**
- **Lever** — Primary source. Higher signal, better role quality for TPM/Delivery lanes.
- **Greenhouse** — Secondary source. More saturated, lower signal, but still active.
- **RSS / USAJobs** — Staged off. Do not activate.
- **LinkedIn** — Manual reference only. Not automated. Not scraping.

**Activation prerequisite:** Greenhouse first-rollout must already be complete (one full discovery cycle + dedup cycle verified). Lever can run alongside Greenhouse or independently.

> ⚠️ **Netlify quota note:** If your Netlify account returns `503 usage_exceeded` on function calls, scheduled automation cannot run safely. See §15 (Post-Quota Next Steps) before enabling n8n schedules.

---

## §1 What Lever Provides

Lever is a public ATS (Applicant Tracking System) with a free JSON API:

```
GET https://api.lever.co/v0/postings/{companySlug}?mode=json
```

No authentication required. Each company uses a slug (e.g. `atlassian`, `canva`, `servicenow`).

Returns: title, description, location, hostedUrl (canonical link), applyUrl, unique job ID.

The system normalises each posting to:
- `source_family = 'lever'`
- `source_job_id` = Lever posting UUID
- `canonical_job_url` = `j.hostedUrl`
- `application_url` = `j.applyUrl || j.hostedUrl`

---

## §2 Verify Lever Company Slugs First

Before activating, confirm each company slug is valid and has postings:

```
https://jobs.lever.co/{slug}
https://api.lever.co/v0/postings/{slug}?mode=json
```

**Verified working slugs (confirmed in live discovery):**
- `aerostrat` → https://jobs.lever.co/aerostrat
- `thinkahead` → https://jobs.lever.co/thinkahead
- `immutable` → https://jobs.lever.co/immutable

**Additional slugs to check (verify before adding):**
- `atlassian` → https://jobs.lever.co/atlassian
- `canva` → https://jobs.lever.co/canva
- `buildkite` → https://jobs.lever.co/buildkite
- `deputy` → https://jobs.lever.co/deputy
- `go1` → https://jobs.lever.co/go1

> Always verify the slug is still active — company boards come and go. A 404 or empty array means the slug is no longer valid.

**Verification step:** Open the API URL in your browser and confirm it returns a JSON array. If the slug is wrong or the company has no live postings, the array will be empty or you'll get a 404.

Only add slugs you have manually confirmed.

---

## §3 Required Env Vars for Lever

Set these in Netlify (Site Settings → Environment Variables):

| Variable | Value | Notes |
|---|---|---|
| `LEVER_BOARDS` | `aerostrat,thinkahead,immutable` (comma-separated slugs) | Required for Lever source. Use verified slugs only. |
| `LIVE_INTAKE_ENABLED` | `true` | Must already be true from Greenhouse rollout |
| `MAX_RECORDS_PER_RUN` | `50` | Already set — no change needed |

**Rules:**
- `LEVER_BOARDS` must never use a `VITE_` prefix (server-side only)
- Use only slugs you have manually verified
- Do not add `USAJOBS_API_KEY` or other new source vars in this same deploy

---

## §4 Enable the Lever Source

After setting `LEVER_BOARDS` in Netlify and redeploying:

1. Open the app → `/sources`
2. Find **"Lever Job Postings (configured companies)"** (`src-lever-boards`)
3. Confirm `LIVE_INTAKE_ENABLED = ON` banner shows green
4. Click **Enable** on the Lever source
5. Confirm it shows **Yes** in the Enabled column

The source is now live-capable.

**Go:**
- Lever source shows Enabled = Yes
- LIVE_INTAKE_ENABLED = ON

**No-Go:**
- LIVE_INTAKE_ENABLED still OFF → set it true in Netlify and redeploy first
- LEVER_BOARDS not set → function will throw `LEVER_BOARDS env var is empty` error

---

## §5 Run First Manual Lever Discovery

```bash
export SITE_URL=https://YOUR_SITE.netlify.app
export DISCOVERY_SECRET=YOUR_SECRET
./scripts/run-discovery.sh src-lever-boards
```

Or via curl:

```bash
curl -X POST $SITE_URL/.netlify/functions/discover \
  -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"src-lever-boards"}'
```

Expected response shape:

```json
{
  "ok": true,
  "mode": "live",
  "sources_run": 1,
  "total_discovered": 12,
  "total_ingested": 8,
  "total_recommended": 4,
  "results": [
    {
      "source_id": "src-lever-boards",
      "discovered": 12,
      "ingested": 8,
      "deduped": 0,
      "error": null
    }
  ]
}
```

**Go:**
- `ok: true`
- `mode: live`
- `total_ingested > 0` (some real roles ingested)
- No `error` field in results
- No 500s

**No-Go / Stop conditions:**
- `error: 'LEVER_BOARDS env var is empty'` → `LEVER_BOARDS` not set or not deployed
- `error: 'HTTP 404 fetching...'` → slug is wrong; verify manually at `jobs.lever.co/{slug}`
- `total_ingested = 0` with `total_discovered = 0` → no Lever postings match the discovery profile title keywords; verify slug has open roles with TPM/Delivery/PM titles
- 500 → check Supabase connection and migrations

---

## §6 Inspect Queue Quality Immediately After First Run

Open `/tracker` → Approval Queue and check Lever-sourced roles.

**What must be true:**
- Real `canonical_job_url` values (should be `https://jobs.lever.co/...`)
- Sensible TPM/Delivery scoring
- `source_family = 'lever'` visible on role detail
- All roles are `pending` approval (never auto-approved)
- Generic Ops noise is low (<50% of ingested should be non-recommended)

**Check via Reports → Source Quality:**
- Open `/reports` → click **Source Quality**
- Compare `lever` vs `greenhouse` recommended percentages
- If Lever recommended % < 40% with >5 records, it is flagged ⚠ Noisy

**Suspicious / STOP conditions:**
- >50% of Lever roles are generic ops/non-technical → LEVER_BOARDS slugs may be wrong companies
- Many null/bad URLs (`canonical_job_url = null`) → Lever API response issue
- Auto-approved roles → STOP, something is wrong with the approval gate
- Apply Pack broken on Lever role → STOP, check approval + Apply Pack pipeline

**Go:**
- At least one real TPM/Delivery/PM role with valid `jobs.lever.co/...` URL
- Score distribution makes sense
- None auto-approved

---

## §7 Run Lever Discovery a Second Time (Dedup Check)

```bash
./scripts/run-discovery.sh src-lever-boards
```

Or use `./scripts/check-live.sh` (runs all enabled sources).

**Expected:**
- `total_ingested` = 0 or near-zero (same postings deduped)
- `deduped > 0` in per-source results
- No new flood in approval queue

Dedup works via:
- **Primary:** `source_family:source_job_id` (Lever posting UUID, unique per posting)
- **Fallback:** title+company+URL hash

**Go:**
- `total_ingested = 0` or very small number
- `deduped` matches previous `ingested` count (approximately)
- Queue stays clean

**STOP immediately if:**
- Second run ingests the same large batch again → dedup broken, do not proceed to n8n scheduling
- `deduped = 0` when it should be >0 → investigate before enabling schedule

---

## §8 Approve One Strong Lever Role — Apply Pack Test

1. Open `/queue`
2. Find a strong TPM or Delivery Manager role from Lever (check `source_family` on detail page)
3. Approve it
4. Open the Apply Pack
5. Confirm:
   - `canonical_job_url` links to a real `jobs.lever.co/...` URL
   - Apply Pack shows correct title, company, fit score
   - Cover note block references the right role title and company
   - No null/broken URL in the Apply Pack

**Go:**
- Apply Pack links to the real Lever posting
- All fields populated correctly

**No-Go:**
- Apply Pack URL is null or wrong
- Apply Pack company/title is garbled

---

## §9 Enable n8n Scheduling for Lever

After both the first-run and second-run dedup checks pass clean:

1. Open n8n → Workflows
2. Open **05 — Job Discovery Run**
3. The schedule already fires `/discover` with no `sourceId` — it runs all enabled sources including Lever
4. Confirm `src-lever-boards` is enabled in the Sources UI
5. Run the workflow manually once more in n8n to confirm it works
6. Enable the schedule

No workflow changes are needed. Lever is automatically included when it is enabled in the Sources UI.

---

## §10 How to Disable Lever Only (Without Touching Greenhouse)

**Fast disable (Sources UI):**
1. Open `/sources`
2. Click **Disable** on **Lever Job Postings**
3. Lever discovery stops immediately on the next run — Greenhouse continues

**Fast disable (env var):**
1. Set `LEVER_BOARDS=` (empty string) in Netlify env vars
2. Redeploy
3. Next /discover call for Lever will throw a config error and log it — Greenhouse runs cleanly

**Both approaches leave Greenhouse running.**

---

## §11 Safe Delete of Bad Lever Records

If Lever discovery floods the queue with junk and you need to clean it up:

**Step 1 — Preview only (never skip this):**

```sql
SELECT id, title, company, source_family, discovered_at, approval_state
FROM opportunities
WHERE source_family = 'lever'
  AND approval_state = 'pending'
  AND discovered_at > 'YYYY-MM-DD'
ORDER BY discovered_at DESC;
```

Replace `YYYY-MM-DD` with the date of the bad run.

**Step 2 — Delete only after verifying preview:**

```sql
DELETE FROM opportunities
WHERE source_family = 'lever'
  AND approval_state = 'pending'
  AND discovered_at > 'YYYY-MM-DD';
```

**NEVER delete approved records.**
This pattern only removes pending records from the bad run.

---

## §12 Quality Thresholds for Lever Rollback Decision

Disable Lever immediately if any of the following are true after the first full run:

| Signal | Threshold | Action |
|---|---|---|
| Recommended rate | < 30% with ≥10 records | Disable Lever, review slugs |
| Generic Ops noise | > 60% of ingested records | Disable Lever, tighten LEVER_BOARDS |
| Null canonical URLs | > 20% of ingested | Lever API issue, disable until resolved |
| Dedup failure | Second run ingests same batch | STOP, do not schedule |
| Auto-approved records | Any | STOP, something is wrong with approval gate |

Check via Reports → Source Quality for the recommended rate and lane distribution.

---

## §13 What Not To Do

- Do not activate USAJobs, SEEK, or any other source in this same pass
- Do not enable n8n scheduling before the dedup check passes
- Do not delete approved records under any circumstances
- Do not manually edit Lever job data — let the pipeline normalise it
- Do not add VITE_ prefix to LEVER_BOARDS
- Do not activate RSS, USAJobs, or any additional sources in this same pass

---

## §14 Env Var Checklist

Before going live with Lever:

- [ ] `LEVER_BOARDS` set in Netlify (no `VITE_` prefix) — use verified slugs only
- [ ] Lever slugs manually verified at `jobs.lever.co/{slug}` and `api.lever.co/v0/postings/{slug}?mode=json`
- [ ] `LIVE_INTAKE_ENABLED=true` already set
- [ ] `DISCOVERY_SECRET` already set
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already set
- [ ] All 4 Supabase migrations already run (001–004)
- [ ] Greenhouse already active and clean
- [ ] Netlify function quota not exhausted (test `/discover` returns 200, not 503)

---

## §15 Post-Quota Next Steps (After Netlify Quota Is Resolved)

> **When to use this section:** Only after confirming that Netlify Functions no longer return `503 usage_exceeded`. Do not attempt to enable scheduled automation while quota is exhausted.

### What `503 usage_exceeded` means

Netlify Free tier limits the number of function invocations per month. When that limit is exhausted, all Netlify Functions return HTTP 503. This affects:
- All `/discover` calls (scheduled and manual)
- All API endpoints the website relies on
- The n8n workflows that call those endpoints

**This is a Netlify account plan issue — not a code issue.**

### How to verify quota is resolved

```bash
# Test with your actual secret
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://YOUR_SITE/.netlify/functions/discover \
  -H "X-Discovery-Secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 200 or 401 (auth test)
# Bad: 503 → quota still exhausted — do not proceed
```

If this returns `503`, do not enable any schedules. Options:
- Wait for the monthly quota to reset
- Upgrade your Netlify plan (Pro has higher limits)
- Use Netlify CLI to test locally against the live Supabase DB directly

### Exact post-quota sequence (Lever-first)

Follow this **exact** order after quota is confirmed resolved:

1. **Confirm the endpoint is live** — curl test above returns 200 or 401, not 503
2. **Run one real Lever discovery through the deployed Netlify endpoint**
   ```bash
   curl -X POST https://YOUR_SITE/.netlify/functions/discover \
     -H "X-Discovery-Secret: YOUR_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"sourceId":"src-lever-boards"}'
   ```
   → Expect `ok: true`, `total_ingested > 0`, no errors
3. **Approve one real Lever role through the live app** — Open `/queue`, approve one strong TPM/Delivery role
4. **Verify Apply Pack generation through the live path** — Check the approved role has an Apply Pack with a valid `jobs.lever.co/...` URL
5. **Only then enable the n8n scheduled daily discovery** (workflow `05-job-discovery.json`, Lever-first daily at 7am UTC)
6. **Compare Lever vs Greenhouse quality** over 24–48 hours via Reports → Source Quality
7. **Only after that consider any additional source** — but do not activate RSS or USAJobs yet

### Lever-first scheduling strategy (post-quota)

- **Primary daily run:** Lever discovery at 7am UTC (`src-lever-boards`)
- **Secondary run:** Greenhouse discovery less frequently or alongside Lever
- **RSS:** Staged off — do not activate
- **USAJobs:** Staged off — do not activate without separate decision

This is not a code change — it is managed by which sources are enabled in the Sources UI and which are configured via env vars.

---

*This runbook covers Lever only. For Greenhouse setup, see LIVE_ACTIVATION_RUNBOOK.md.*
