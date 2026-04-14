-- ============================================================
-- Migration 001 — Discovery fields on opportunities
-- ============================================================
-- Run once against your Supabase project.
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards).
-- ============================================================

-- Add canonical_job_url -------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'canonical_job_url'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN canonical_job_url TEXT;
    COMMENT ON COLUMN opportunities.canonical_job_url IS
      'Original posting URL from the source ATS/feed. "Open Original Posting" button uses this.';
  END IF;
END $$;

-- Add application_url ----------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'application_url'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN application_url TEXT;
    COMMENT ON COLUMN opportunities.application_url IS
      'Direct apply link (may differ from canonical_job_url, e.g. ATS apply redirect).';
  END IF;
END $$;

-- Add source_family ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'source_family'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN source_family TEXT;
    COMMENT ON COLUMN opportunities.source_family IS
      'Source adapter family: greenhouse | lever | usajobs | seek | rss | demo | manual | csv';
  END IF;
END $$;

-- Add source_job_id ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'source_job_id'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN source_job_id TEXT;
    COMMENT ON COLUMN opportunities.source_job_id IS
      'The job ID as provided by the source ATS/feed (Greenhouse numeric ID, Lever UUID, etc.).';
  END IF;
END $$;

-- Add is_demo_record -----------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'is_demo_record'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN is_demo_record BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN opportunities.is_demo_record IS
      'TRUE only for pre-seeded demo records. FALSE for all real discovered jobs.';
  END IF;
END $$;

-- Add discovered_at (ingestion timestamp for sorting the Discovered view) ------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'discovered_at'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN discovered_at TIMESTAMPTZ;
    COMMENT ON COLUMN opportunities.discovered_at IS
      'Timestamp when the job was first discovered/ingested. Used by the Discovered view.';
  END IF;
END $$;

-- Add discovery_source_id (foreign key to sources.id for provenance) ----------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'discovery_source_id'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN discovery_source_id TEXT;
    COMMENT ON COLUMN opportunities.discovery_source_id IS
      'ID of the source record that produced this opportunity (for provenance).';
  END IF;
END $$;

-- Backfill discovered_at from ingested_at for existing rows -------------------
UPDATE opportunities
SET discovered_at = ingested_at
WHERE discovered_at IS NULL AND ingested_at IS NOT NULL;

-- Backfill is_demo_record = FALSE for any existing rows that have NULL ---------
UPDATE opportunities
SET is_demo_record = FALSE
WHERE is_demo_record IS NULL;

-- Index: fast queries for the Discovered view (sort by recency, live only) ----
CREATE INDEX IF NOT EXISTS idx_opportunities_discovered_at
  ON opportunities (discovered_at DESC)
  WHERE is_demo_record = FALSE;

-- Index: dedup lookups by source_family + source_job_id -----------------------
CREATE INDEX IF NOT EXISTS idx_opportunities_source_job
  ON opportunities (source_family, source_job_id)
  WHERE source_job_id IS NOT NULL;

-- ============================================================
-- Verify
-- ============================================================
-- Run to check columns were added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'opportunities'
--   AND column_name IN (
--     'canonical_job_url','application_url','source_family',
--     'source_job_id','is_demo_record','discovered_at','discovery_source_id'
--   )
-- ORDER BY column_name;
