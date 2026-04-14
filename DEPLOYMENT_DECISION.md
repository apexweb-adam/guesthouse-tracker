# Deployment Decision

## Architecture Chosen

**Frontend:** React + Vite → Netlify static hosting (`dist/`)

**Backend API:** Netlify Functions (ES modules, `netlify/functions/`) — serverless, same-domain, no separate Express server needed.

**Persistence:**
- **Deployed (production):** Supabase — provides durable PostgreSQL + REST API. Already a project dependency (`@supabase/supabase-js`).
- **Demo / preview:** localStorage in-browser. No backend required. Works on Netlify with `VITE_DEMO_MODE=true` (the default).

**Scheduling:**
- **Netlify Scheduled Functions** via `@netlify/functions` `schedule()` export.
  - `ingest-scheduled.js` — runs every 2 hours (live sources only, when `LIVE_INTAKE_ENABLED=true`)
  - `stale-scan-scheduled.js` — runs daily at 08:00 UTC

**Live intake:** OFF by default. Controlled by `LIVE_INTAKE_ENABLED` environment variable. CSV and manual intake are always enabled.

---

## Why This Architecture

### Why Not Local SQLite / Express?
The original repo had no Express server and no SQLite. It was already a client-side app (React + Vite). Adding Express+SQLite to a Netlify deployment would require either:
- A separate always-on server (not serverless), or
- Ephemeral SQLite on function storage (data lost on cold starts — unacceptable for a tracker)

Netlify Functions + Supabase is the minimal, honest, durable path.

### Why Supabase?
- Already in the project's dependencies
- Provides durable PostgreSQL, REST API, and SDK
- Free tier is sufficient for personal job search scale
- Functions connect via service role key (server-side only)

### Why Demo Mode First?
The deployed preview must be truthful. Without Supabase credentials configured, the system must not appear broken. Demo mode seeded with realistic data lets the UI be fully functional and demonstrable without any backend credentials.

### Why Netlify Scheduled Functions?
- Co-located with the rest of the serverless architecture
- No separate scheduler service required
- cron syntax, triggered by Netlify platform
- Honest: scheduled intake only runs when explicitly enabled

---

## What Is NOT Deployed

- **LinkedIn automation:** NOT included. Not planned. Not safe.
- **Browser-bot application flows:** NOT included.
- **Arbitrary scraping:** NOT included.
- **Blind auto-apply:** NOT included. All applications require explicit human approval.

---

## One Known Honest Constraint

Netlify Functions are stateless and cold-started. The in-memory demo store in `db.js` (`_demo` object) is for **function-level testing only** and will lose state between cold starts. For production use, Supabase must be configured. This is documented and not hidden.

---

## Supabase Schema Required (Production)

Run these SQL statements in your Supabase SQL editor:

```sql
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text,
  location text,
  url text,
  description text,
  source text,
  dedup_hash text unique,
  is_duplicate boolean default false,
  lane text,
  fit_score integer,
  fit_signals jsonb,
  recommended boolean default false,
  high_fit boolean default false,
  resume_emphasis text,
  recommendation_text text,
  status text default 'discovered',
  approval_state text default 'pending',
  human_override jsonb,
  notes text,
  applied_date timestamptz,
  last_action_date timestamptz,
  next_action text,
  next_action_due date,
  stale_flag boolean default false,
  stale_reason text,
  stale_flagged_at timestamptz,
  suggested_next_status text,
  ingested_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table sources (
  id text primary key,
  name text,
  type text,
  url text,
  enabled boolean default true,
  trust_level text default 'medium'
);

create table ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  source_id text,
  run_at timestamptz default now(),
  count_discovered integer default 0,
  count_deduped integer default 0,
  count_new integer default 0,
  count_high_review integer default 0,
  errors jsonb,
  status text default 'success'
);

-- Enable RLS and set service role access if needed
alter table opportunities enable row level security;
alter table sources enable row level security;
alter table ingestion_logs enable row level security;

-- Service role bypasses RLS — no additional policies needed for function access
```

### Supabase Migration (if upgrading an existing schema)

If you already ran the initial schema, add the `count_high_review` column:

```sql
alter table ingestion_logs add column if not exists count_high_review integer default 0;
```

The application is defensive — if this column does not exist yet, `logIngestion` will fall back and write the log without it.
