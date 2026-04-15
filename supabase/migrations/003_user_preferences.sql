-- Migration 003: user_preferences table for server-side profile persistence
--
-- Stores per-profile (single-user system) preferences such as the discovery profile.
-- Uses a string profile_key so it can hold multiple preference namespaces if needed.
-- For this system, profile_key = 'discovery_profile' is the primary use case.

CREATE TABLE IF NOT EXISTS user_preferences (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_key TEXT        NOT NULL UNIQUE,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial index to speed up single-key lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences (profile_key);

-- Comments
COMMENT ON TABLE user_preferences IS 'Server-side user preference storage. profile_key=discovery_profile stores the discovery job filter profile.';
COMMENT ON COLUMN user_preferences.profile_key IS 'Unique namespace key, e.g. discovery_profile';
COMMENT ON COLUMN user_preferences.data IS 'JSON blob of preference data';
