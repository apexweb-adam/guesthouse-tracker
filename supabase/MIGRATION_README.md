# Supabase Migration Guide

## Migration 001 — Discovery fields on opportunities

**File:** `supabase/migrations/001_discovery_fields.sql`

### What it adds

| Column | Type | Description |
|---|---|---|
| `canonical_job_url` | TEXT | Original posting URL from source ATS/feed |
| `application_url` | TEXT | Direct apply link (may differ from canonical) |
| `source_family` | TEXT | Source adapter: `greenhouse`, `lever`, `usajobs`, `seek`, `rss`, `demo`, `manual`, `csv` |
| `source_job_id` | TEXT | Job ID from the source ATS/feed |
| `is_demo_record` | BOOLEAN (default FALSE) | TRUE only for seeded demo records |
| `discovered_at` | TIMESTAMPTZ | When first ingested (for Discovered view sorting) |
| `discovery_source_id` | TEXT | Links back to `sources.id` for provenance |

It also:
- backfills `discovered_at` from `ingested_at` for existing rows
- backfills `is_demo_record = FALSE` for existing rows
- creates two indexes (Discovered view + dedup by source job ID)

### How to run

**Supabase dashboard (easiest):**
1. Open your project → SQL Editor
2. Paste the contents of `001_discovery_fields.sql`
3. Click Run

**Supabase CLI:**
```bash
supabase db push   # if using supabase CLI with local config
# or
psql "$DATABASE_URL" -f supabase/migrations/001_discovery_fields.sql
```

**Safe to re-run:** All ALTER TABLE statements use `IF NOT EXISTS` guards.

### Why these fields are needed

The Real Job Finder (introduced in the previous PR) stores `canonical_job_url`,
`application_url`, `source_family`, `source_job_id`, and `is_demo_record` on every
discovered opportunity. Without this migration, Supabase would silently drop these
fields on insert.

Once applied:
- The Discovered view can filter `is_demo_record = FALSE` and sort by `discovered_at`
- "Open Original Posting" always uses the persisted `canonical_job_url`
- Apply Pack exports include both URLs
- Provenance queries can join `source_family` + `source_job_id` for dedup audit

### Rollback

To remove all added columns (only do this if you have not yet gone live):
```sql
ALTER TABLE opportunities
  DROP COLUMN IF EXISTS canonical_job_url,
  DROP COLUMN IF EXISTS application_url,
  DROP COLUMN IF EXISTS source_family,
  DROP COLUMN IF EXISTS source_job_id,
  DROP COLUMN IF EXISTS is_demo_record,
  DROP COLUMN IF EXISTS discovered_at,
  DROP COLUMN IF EXISTS discovery_source_id;
DROP INDEX IF EXISTS idx_opportunities_discovered_at;
DROP INDEX IF EXISTS idx_opportunities_source_job;
```

---

## Migration 005 — Auto-apply eligibility and Python agent tracking

**File:** `supabase/migrations/005_auto_apply_fields.sql`

> ⚠️ **Run this migration before deploying the `bulk-approve` endpoint or any code that
> sets `auto_apply_eligible` / `python_agent_processed_at`.**

### What it adds

| Column | Type | Description |
|---|---|---|
| `auto_apply_eligible` | BOOLEAN (default FALSE) | Set to TRUE when a job is approved AND `fit_score >= 75`. The Python job agent reads this in Phase 4 to find roles to auto-submit. |
| `python_agent_processed_at` | TIMESTAMPTZ (nullable) | Set when the Python agent calls `/sync-apply-pack`. NULL = not yet processed. Use `GET /opportunities?python_agent_pending=true` to fetch only unprocessed jobs and skip already-scored ones — **this is the fix for excessive API credit usage.** |

It also creates two indexes:
- `idx_opportunities_python_agent_pending` — fast lookup for unprocessed jobs
- `idx_opportunities_auto_apply` — fast lookup for Phase 4 target list

### How to run

**Supabase dashboard (easiest):**
1. Open your project → SQL Editor
2. Paste the contents of `005_auto_apply_fields.sql`
3. Click Run

**Supabase CLI:**
```bash
psql "$DATABASE_URL" -f supabase/migrations/005_auto_apply_fields.sql
```

**Safe to re-run:** All statements use `IF NOT EXISTS` guards.

### Why these fields are needed

**`auto_apply_eligible`:**
Before this field, the Python job agent's Phase 4 ("Auto-applying") always returned 0 jobs
because the system had no flag to signal which approved, high-score jobs were ready for
auto-submission. Now:
- `/approve` sets `auto_apply_eligible=true` when `fit_score >= 75 && recommended=true`
- `/bulk-approve` does the same for bulk approvals
- The Python agent queries `GET /opportunities?auto_apply_eligible=true` to get Phase 4 targets

**`python_agent_processed_at`:**
Without this field, the Python agent re-processed all 1034 DB jobs on every run, making
an LLM API call for each one. With this field:
- `/sync-apply-pack` stamps `python_agent_processed_at` whenever it receives a processed job
- The Python agent queries `GET /opportunities?python_agent_pending=true` to only fetch
  jobs it hasn't processed yet — skipping the 1034 already-scored jobs saves significant
  API credits on every subsequent run

### New API endpoints and query params

**New endpoint: `POST /bulk-approve`**
Approves all pending recommended jobs above a score threshold in one call. Designed to
process the backlog of 1034 jobs without clicking each one in the UI.

```bash
# Approve all recommended jobs with fit_score >= 70, up to 200 per call
# Repeat until "approved" = 0 in the response
curl -X POST https://your-site.netlify.app/.netlify/functions/bulk-approve \
  -H "X-Discovery-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"min_score": 70, "max_jobs": 200}'

# Dry run first to see what would be approved:
curl -X POST https://your-site.netlify.app/.netlify/functions/bulk-approve \
  -H "X-Discovery-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"min_score": 70, "dry_run": true}'
```

**New GET query params on `/opportunities`:**

```
GET /opportunities?python_agent_pending=true     → only jobs not yet LLM-processed (saves credits)
GET /opportunities?auto_apply_eligible=true      → Phase 4 target list
GET /opportunities?approval_state=pending        → only pending approval jobs
GET /opportunities?min_score=70                  → jobs with fit_score >= 70
GET /opportunities?approval_state=pending&min_score=70&recommended=true  → bulk-approve preview
```

**New PATCH fields on `/opportunities`:**

```
PATCH /opportunities?id=<id>
{ "python_agent_processed_at": "2026-04-27T18:00:00Z" }   → mark as processed (saves credits)
{ "auto_apply_eligible": true }                            → manually flag for auto-apply
```

### Rollback

```sql
ALTER TABLE opportunities
  DROP COLUMN IF EXISTS auto_apply_eligible,
  DROP COLUMN IF EXISTS python_agent_processed_at;
DROP INDEX IF EXISTS idx_opportunities_python_agent_pending;
DROP INDEX IF EXISTS idx_opportunities_auto_apply;
```
