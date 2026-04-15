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
