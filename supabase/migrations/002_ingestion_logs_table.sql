-- ============================================================
-- Migration 002 — ingestion_logs table
-- ============================================================
-- Creates the ingestion_logs table if it does not already exist.
-- Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
--
-- This table stores one row per job discovery / intake run,
-- used by the Sources page for health metrics (last run, counts,
-- failure rate, noisy-source detection).
-- ============================================================

CREATE TABLE IF NOT EXISTS ingestion_logs (
  id                TEXT        PRIMARY KEY,
  run_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_id         TEXT        NOT NULL,

  -- Counts per run
  count_discovered  INTEGER     NOT NULL DEFAULT 0,
  count_new         INTEGER     NOT NULL DEFAULT 0,
  count_deduped     INTEGER     NOT NULL DEFAULT 0,
  count_high_review INTEGER     NOT NULL DEFAULT 0,  -- low-fit (not recommended) records

  -- Run status
  status            TEXT        NOT NULL DEFAULT 'success',  -- success | partial | failure | error
  errors            JSONB                DEFAULT '[]'::JSONB,

  -- Optional metadata
  source_name       TEXT,
  notes             TEXT
);

COMMENT ON TABLE ingestion_logs IS
  'One row per automated or manual source ingestion run. Used by the Sources health dashboard.';

COMMENT ON COLUMN ingestion_logs.count_high_review IS
  'Records that were ingested but scored below the recommended threshold (fit_score < 70). '
  'High percentage = source is noisy.';

COMMENT ON COLUMN ingestion_logs.errors IS
  'JSON array of error message strings from this run (empty array if clean).';

-- Index: fast lookup of recent runs per source
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source_run_at
  ON ingestion_logs (source_id, run_at DESC);

-- Index: fast lookup of all failures
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_status
  ON ingestion_logs (status)
  WHERE status IN ('failure', 'error', 'partial');

-- ============================================================
-- Backfill: if the table already existed with old column names
-- (records_fetched / new_records / duplicates), add the new
-- columns as aliases so the sources health view still works.
-- ============================================================

DO $$ BEGIN
  -- count_discovered alias for records_fetched (old schema compat)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingestion_logs' AND column_name = 'count_discovered'
  ) THEN
    ALTER TABLE ingestion_logs ADD COLUMN count_discovered INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingestion_logs' AND column_name = 'count_new'
  ) THEN
    ALTER TABLE ingestion_logs ADD COLUMN count_new INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingestion_logs' AND column_name = 'count_deduped'
  ) THEN
    ALTER TABLE ingestion_logs ADD COLUMN count_deduped INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingestion_logs' AND column_name = 'count_high_review'
  ) THEN
    ALTER TABLE ingestion_logs ADD COLUMN count_high_review INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- Verify
-- ============================================================
-- Run to check the table and key columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'ingestion_logs'
-- ORDER BY ordinal_position;
