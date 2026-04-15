-- Migration 004: Readiness History Table
-- Tracks key state transitions for opportunities to support
-- readiness reporting and explainability.
--
-- Events tracked:
--   readiness_score_changed   - pack_readiness_score changed
--   status_changed            - opportunity status changed
--   apply_url_added           - application_url was added
--   pack_regenerated          - Apply Pack was regenerated
--   approval_state_changed    - approval_state changed
--
-- This table is append-only (no updates/deletes).
-- In demo mode, history is stored in localStorage (see api.js recordReadinessHistory).

CREATE TABLE IF NOT EXISTS readiness_history (
  id             TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB DEFAULT '{}',
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readiness_history_opp
  ON readiness_history (opportunity_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_readiness_history_event
  ON readiness_history (event_type, recorded_at DESC);
