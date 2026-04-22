-- Migration 005: Resume Vault
-- Stores structured resume metadata for Sample Candidate application tracking.
--
-- Note: The application also supports JSON-based vault storage via user_preferences
-- (key = 'resume_vault'). This migration creates a relational alternative for
-- production deployments that prefer structured queries.
-- If you are using the JSON/user_preferences approach, this migration is supplementary.

-- ─── Resume vault table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  original_file_name TEXT,
  lane TEXT NOT NULL CHECK (lane IN ('tpm','it_pm','delivery','program','ops','pm_generic')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','fallback','archived')),
  domain_tags JSONB DEFAULT '[]',
  quality_score INTEGER DEFAULT 50 CHECK (quality_score >= 0 AND quality_score <= 100),
  notes TEXT DEFAULT '',
  version_label TEXT DEFAULT '',
  duplicate_group TEXT DEFAULT '',
  is_canonical BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_resumes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_resumes_updated_at ON resumes;
CREATE TRIGGER set_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_resumes_updated_at();

-- Index for fast lane+status lookups (used by recommendation engine)
CREATE INDEX IF NOT EXISTS idx_resumes_lane_status ON resumes (lane, status);

-- Index for canonical lookups
CREATE INDEX IF NOT EXISTS idx_resumes_canonical ON resumes (is_canonical, status);

-- ─── Resume usage tracking column on opportunities ────────────────────────────
-- Adds applied_resume_id to opportunities so each application can log which
-- resume version was used.

ALTER TABLE IF EXISTS opportunities
  ADD COLUMN IF NOT EXISTS applied_resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS opportunities
  ADD COLUMN IF NOT EXISTS applied_resume_log JSONB;

-- Index for analytics queries (response/interview rate by resume)
CREATE INDEX IF NOT EXISTS idx_opportunities_applied_resume_id ON opportunities (applied_resume_id)
  WHERE applied_resume_id IS NOT NULL;

-- Verify
-- SELECT id, lane, status, is_canonical, quality_score FROM resumes ORDER BY status, lane;
-- SELECT id, applied_resume_id FROM opportunities WHERE applied_resume_id IS NOT NULL LIMIT 10;
