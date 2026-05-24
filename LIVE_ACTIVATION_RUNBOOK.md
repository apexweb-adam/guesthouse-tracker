# Live Activation Runbook

Use this checklist before turning live intake on for the tracker.

## Pre-Activation Checklist

- Run the Supabase migrations in order:
  - `001_discovery_fields.sql`
  - `002_ingestion_logs_table.sql`
  - `003_user_preferences.sql`
  - `004_readiness_history.sql`
- Verify `opportunities`, `ingestion_logs`, `user_preferences`, and `readiness_history` exist.
- Set `DISCOVERY_SECRET` in Netlify and in the n8n environment.
- Set `LIVE_INTAKE_ENABLED=false` until the first manual smoke test passes.
- Start with Greenhouse as the first source. Set `GREENHOUSE_BOARDS` to one known-good board before adding Lever or USAJobs.

## SQL Verification

```sql
select count(*) from readiness_history;
select profile_key from user_preferences limit 5;
select count(*) from ingestion_logs;
```

## Environment Variables

- `SITE_URL`
- `DISCOVERY_SECRET`
- `LIVE_INTAKE_ENABLED`
- `GREENHOUSE_BOARDS`
- `LEVER_BOARDS`
- `USAJOBS_API_KEY`
- `USAJOBS_USER_AGENT`

## Manual Discovery Run

```bash
curl -X POST "$SITE_URL/.netlify/functions/discover" \
  -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"greenhouse"}'
```

The `scripts/run-discovery.sh` helper performs the same manual trigger. The `scripts/check-live.sh` helper checks that unauthorized calls return `401` and that `/opportunities` is reachable.

## n8n Workflow Checklist

- `05-job-discovery.json`: uses `SITE_URL`, sends `X-Discovery-Secret`, and calls `/discover`.
- `06-daily-approval-digest.json`: uses `SITE_URL` and calls `/digest`.
- `07-weekly-readiness-summary.json`: uses `SITE_URL` and calls `/digest?type=weekly`.

## Dedup Success Criteria

- First run may create new records.
- Second run against the same source should show `total_ingested: 0`.
- A dedup failure means duplicate jobs are inserted for the same `source_family:source_job_id` or stable title/company key. If dedup looks broken, stop live intake and inspect `dedup_reason`.

## Go / No-Go Criteria

Go when migrations are complete, `/opportunities` loads, unauthorized discovery returns `401`, the first Greenhouse manual run succeeds, and the second identical run shows dedup working. No-go if authorization fails open, the tracker cannot list jobs, dedup is broken, or readiness history writes fail.

## Kill Switch / Rollback

Set `LIVE_INTAKE_ENABLED=false` in Netlify to stop scheduled live intake. Stop n8n scheduled discovery by disabling the schedule for `05-job-discovery.json` while investigating. Keep existing records; do not delete data unless a separate cleanup plan has been reviewed.

If cleanup is approved, use a safe delete pattern that only targets pending records created by the bad run:

```sql
delete from opportunities
where approval_state = 'pending'
  and status = 'discovered'
  and ingested_at >= '<bad-run-start-iso>';
```
