-- ============================================================
-- Migration 005 — Auto-apply eligibility and Python agent tracking
-- ============================================================
-- Run once against your Supabase project.
-- Safe to re-run (uses IF NOT EXISTS / DO $$ guards).
--
-- MUST be applied before deploying the bulk-approve endpoint or
-- any code that sets auto_apply_eligible / python_agent_processed_at.
-- ============================================================

-- Add auto_apply_eligible -------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'auto_apply_eligible'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN auto_apply_eligible BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN opportunities.auto_apply_eligible IS
      'TRUE when this opportunity has been approved and scores above the auto-apply threshold '
      '(default fit_score >= 75, recommended=true). The Python job agent reads this flag to decide '
      'which roles to auto-submit. Set by /approve and /bulk-approve endpoints.';
  END IF;
END $$;

-- Add python_agent_processed_at ------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'opportunities' AND column_name = 'python_agent_processed_at'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN python_agent_processed_at TIMESTAMPTZ;
    COMMENT ON COLUMN opportunities.python_agent_processed_at IS
      'Timestamp when the local Python job agent last processed this opportunity '
      '(scored it via LLM, generated tailored resume/cover letter). NULL means unprocessed. '
      'Use GET /opportunities?python_agent_pending=true to fetch only unprocessed jobs '
      'and avoid re-calling the LLM for already-processed roles (saves API credits).';
  END IF;
END $$;

-- Index: fast lookup for Python agent pending jobs (unprocessed) ---------------
CREATE INDEX IF NOT EXISTS idx_opportunities_python_agent_pending
  ON opportunities (python_agent_processed_at)
  WHERE python_agent_processed_at IS NULL;

-- Index: fast lookup for auto_apply_eligible jobs (Phase 4 target list) --------
CREATE INDEX IF NOT EXISTS idx_opportunities_auto_apply
  ON opportunities (auto_apply_eligible, fit_score DESC)
  WHERE auto_apply_eligible = TRUE;

-- ============================================================
-- Verify
-- ============================================================
-- Run to check columns were added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'opportunities'
--   AND column_name IN ('auto_apply_eligible', 'python_agent_processed_at')
-- ORDER BY column_name;
