# Deployment Runbook

## Prerequisites

- Node.js 20+
- A Netlify account
- (For production) A Supabase project

---

## 1. Local Development

```bash
# Install dependencies
npm install

# Start local dev server (demo mode, no backend needed)
VITE_DEMO_MODE=true npm run dev
# OR with netlify dev (required to test functions locally)
netlify dev
```

**Demo mode** (`VITE_DEMO_MODE=true`): Uses localStorage + pre-seeded data. No Supabase required. All scoring, classification, dedup, and approval flows are fully functional.

---

## 2. First Netlify Deploy (Demo/Preview)

### Via Netlify CLI

```bash
# Install netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Link to a Netlify site (create new or link existing)
netlify sites:create --name job-search-os
# OR
netlify link

# Deploy preview
netlify deploy --dir dist --build

# Deploy to production
netlify deploy --dir dist --build --prod
```

### Via GitHub Integration

1. Push this repo to GitHub
2. Go to [app.netlify.com](https://app.netlify.com) → New site from Git
3. Connect your GitHub repo
4. Build settings:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
5. Add environment variable: `VITE_DEMO_MODE=true`
6. Deploy

**Demo mode will be fully functional immediately.** No Supabase credentials needed.

---

## 3. Production Mode (Supabase)

### 3a. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your project URL and keys

### 3b. Run Database Schema

In your Supabase SQL Editor, run the SQL from `DEPLOYMENT_DECISION.md` (Supabase Schema section).

### 3c. Set Netlify Environment Variables

In Netlify UI → Site settings → Environment variables, add:

| Variable | Value | Notes |
|---|---|---|
| `VITE_DEMO_MODE` | `false` | Enables live backend mode |
| `SUPABASE_URL` | `https://your-project.supabase.co` | From Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key | Server-side only — never expose in frontend |
| `LIVE_INTAKE_ENABLED` | `false` | Keep OFF until sources verified |
| `MAX_RECORDS_PER_RUN` | `50` | Conservative cap per scheduled run |

### 3d. Redeploy

```bash
netlify deploy --prod
```

---

## 4. Enabling Live Source Intake

> **WARNING:** Only enable after you have verified your Lever and/or Greenhouse sources return valid structured data. Do not enable scheduled automation if Netlify returns `503 usage_exceeded` — that is a quota/plan issue, not a code issue.

1. Set `LIVE_INTAKE_ENABLED=true` in Netlify environment variables
2. Go to Sources page → enable **Lever** first (primary source), then Greenhouse (secondary)
3. The scheduled function fires daily at 7am UTC automatically (via n8n workflow 05)
4. Monitor the Sources page for ingestion health, failure counts, and High Review percentage
5. If a source shows a "Noisy source" warning (>50% low-fit records), disable it and review

**Kill switch:** Set `LIVE_INTAKE_ENABLED=false` and redeploy to immediately stop all automated intake.

### First Live Source: Lever (Current Primary)

**Lever is now the recommended primary live source** (higher signal for TPM/Delivery lanes than Greenhouse).
For the complete Lever rollout checklist, see `LEVER_ROLLOUT_RUNBOOK.md`.

**Steps:**
1. Confirm `LIVE_INTAKE_ENABLED=true`, `MAX_RECORDS_PER_RUN=50`, and `DISCOVERY_SECRET` are set
2. Set `LEVER_BOARDS` to 2–3 verified company slugs (e.g. `aerostrat,thinkahead,immutable`)
3. In the Sources page, click **Enable** next to "Lever Job Postings (configured companies)"
4. Trigger a manual discovery run: `curl -X POST https://your-site/.netlify/functions/discover -H "X-Discovery-Secret: your-secret" -d '{"sourceId":"src-lever-boards"}'`
5. Verify in the Sources page: Last Run timestamp updated, Imported count > 0, no failures
6. Verify in the Discovered Jobs view: new records appear with correct lane/score
7. Check that generic Ops/PM roles score below 70 and are NOT recommended
8. After verifying dedup (second run shows 0 new records), proceed to approve strong-fit records

**Greenhouse (secondary):**
Set `GREENHOUSE_BOARDS` to 2–3 company board tokens (e.g. `atlassian,servicenow`) and enable `src-greenhouse-boards` in the Sources UI. Greenhouse is still active and useful alongside Lever.

**Do NOT enable yet:**
- RSS sources — not yet activated; evaluate quality before enabling
- USAJobs — requires `USAJOBS_API_KEY`; staged off for now
- Multiple additional sources simultaneously — enable one at a time

> ⚠️ If Netlify Functions return `503 usage_exceeded`, do not enable any scheduled automation. See `LEVER_ROLLOUT_RUNBOOK.md §15` for the post-quota sequence.

---

## 5. Scheduled Functions

Netlify Scheduled Functions are enabled automatically when deployed. They require:
- A paid Netlify plan OR Netlify free tier with scheduled functions enabled
- The `netlify.toml` `[functions]` config is already set

| Function | Schedule | Purpose |
|---|---|---|
| `ingest-scheduled` | Every 2 hours | Runs live sources (if enabled) |
| `stale-scan-scheduled` | Daily 08:00 UTC | Flags stale/ghosted opportunities |

To test scheduled functions locally:
```bash
netlify functions:invoke ingest-scheduled
netlify functions:invoke stale-scan-scheduled
```

---

## 6. API Endpoints (Netlify Functions)

All endpoints are at `/.netlify/functions/[name]`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/opportunities` | GET | List opportunities (with ?status=, ?lane=, ?recommended=) |
| `/opportunities` | POST | Manual single intake |
| `/opportunities?id=X` | PATCH | Update tracker fields |
| `/intake` | POST | Batch intake (CSV, RSS, API) |
| `/approve` | POST | Approve / reject / override |
| `/sources` | GET | List sources with health |
| `/sources` | PATCH | Toggle source enabled/disabled |
| `/csv-import` | POST | CSV text import |
| `/logs` | GET | List ingestion logs |

---

## 7. n8n Integration

If using n8n for orchestration:

- n8n workflows should call the API endpoints above
- n8n must NOT re-implement scoring/classification logic
- n8n must NOT bypass the approval gate (`/approve` is required before applying)
- Recommended workflow: scheduled trigger → POST `/intake` → results appear in approval queue

Example n8n HTTP request node:
```
URL: https://your-site.netlify.app/.netlify/functions/intake
Method: POST
Body: { "source": "src-rss-seek", "sourceType": "rss", "jobs": [...] }
```

---

## 8. Verification Checklist

### 8a. Demo Mode / Baseline

After deployment, verify:

- [ ] Site loads in browser
- [ ] Demo mode indicator shows in header
- [ ] Dashboard shows 9 demo opportunities
- [ ] Approval Queue shows pending items
- [ ] Approving an item moves it to "approved" status
- [ ] CSV import adds new opportunities and deduplicates
- [ ] Manual intake adds and scores a new opportunity
- [ ] Sources page shows kill switch OFF
- [ ] Opportunity detail shows correct lane, score, signals
- [ ] TPM roles score higher than generic ops roles (verify in tracker)
- [ ] Stale opportunity flagged in demo data (Zip Co / demo-9)
- [ ] Audit trail visible after approve/reject

### 8b. Production Persistence (run `node scripts/verify.js` locally first)

- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set in Netlify UI
- [ ] `VITE_DEMO_MODE=false` set in Netlify UI
- [ ] Redeploy — header shows NO demo badge
- [ ] Create a manual opportunity → appears in Supabase `opportunities` table
- [ ] Approve the opportunity → `approval_state` = `approved` in Supabase
- [ ] Update status (e.g., `applied`) → `status` and `last_action_date` updated in Supabase
- [ ] Reload page — data persists (not lost on reload)

### 8c. Live Intake — One Source (SEEK RSS)

- [ ] `LIVE_INTAKE_ENABLED=true` set in Netlify UI
- [ ] `MAX_RECORDS_PER_RUN=50` set in Netlify UI
- [ ] Run `netlify functions:invoke ingest-scheduled` — exits without error
- [ ] Sources page: `src-rss-seek` shows Last Run timestamp and Imported count
- [ ] Approval Queue: new records from SEEK appear with `approval_state=pending`
- [ ] Run `ingest-scheduled` a second time — no new records inserted (dedup working)
- [ ] Verify at least one generic Ops/PM record is scored low and NOT recommended
- [ ] Verify no record was auto-approved (all approval_state = `pending`)
- [ ] Sources page: High Review count populated after sufficient runs

### 8d. Safety / Kill Switch

- [ ] Set `LIVE_INTAKE_ENABLED=false` → `netlify functions:invoke ingest-scheduled` logs "No live-capable sources enabled" and exits cleanly
- [ ] Manual intake and CSV still work with `LIVE_INTAKE_ENABLED=false`
- [ ] Stale scan runs independently of `LIVE_INTAKE_ENABLED`

### 8e. Scheduled Jobs

- [ ] Stale scan (`stale-scan-scheduled`) runs without errors: `netlify functions:invoke stale-scan-scheduled`
- [ ] After stale scan, opportunities with `status=applied` older than 21 days get `stale_flag=true`
- [ ] Stale scan does NOT auto-change status — only flags for human review

---

## 9. Blockers / Current State

### What requires external accounts:
- **Netlify account + site:** Required to deploy. CLI available.
- **Supabase project:** Required for production persistence. Not required for demo mode.
- **Live source credentials:** Not required for any currently supported sources (RSS is public).

### Exact blocker if deployment cannot complete:
**Netlify account credentials are not available in this automated build environment.** The repository is in a fully deploy-ready state. To deploy:
1. Connect the repository to a Netlify site via GitHub integration or `netlify deploy`
2. Set `VITE_DEMO_MODE=true` (already set in `netlify.toml`)
3. Deploy — the demo preview will be live and fully functional immediately

---

## 10. Resetting Demo Data

In the browser console or the Import page:
```javascript
localStorage.removeItem('job-search-os-v1');
location.reload();
```

---

## 11. Apply Pack Automation Layer (v3.0.0)

### What is Automated Now

After approval, the system immediately:
1. Generates the Apply Pack (`apply_pack_generated` status)
2. Sets `needs_apply_url` if the role is manual external with no apply URL
3. Fires `apply_pack_generated` webhook event
4. Fires `strong_fit_ready_to_apply` webhook event if fit_score ≥ 75 and `recommended=true`

### Copy-Ready Blocks

The Apply Pack now includes two copy-ready draft assets:

**`copy_ready_summary_block`**
- A draft resume summary paragraph aligned to the specific lane and role
- Includes lane framing, key skills from JD, and role-specific context
- Always marked `[DRAFT — review and personalise before use]`
- NOT a final statement — requires human review and personalisation

**`copy_ready_resume_emphasis_block`**
- A formatted list of lead-with themes and proof points
- Structured as "LEAD-WITH THEMES" and "SURFACE THESE PROOF POINTS"
- Always marked `[DRAFT — direction for tailoring, not fabricated claims]`
- Designed to be copied into an editing workflow or notes

Access these in the **✍ Copy-Ready** tab of the Apply Pack page.

### Pack Readiness Score

A `Pack Readiness %` is computed and shown in the Apply Pack action bar.  
Factors: resume recommendation present, keywords, proof points, copy-ready blocks, apply URL, checklist progress, outreach draft.

### Human-Friendly Export

Two export options are available in the Apply Pack action bar:
- **📄 Export Text Pack** — downloads a human-readable `.txt` file with all pack content (role header, URLs, resume recommendation, summary block, emphasis block, keywords, proof points, outreach drafts, checklist, follow-up date)
- **⬇ Export Pack JSON** — downloads the full machine-readable JSON pack

### Workflow Status Progression

```
pending → approved → needs_apply_url (manual external, no URL) → ready_to_prepare
                   → apply_pack_generated (URL present)        → ready_to_apply → applied → follow_up_1 → ...
```

To advance from `needs_apply_url`: add the official apply URL via the banner in ApplyPack.jsx or OpportunityDetail.jsx. Status advances automatically to `apply_pack_generated`.

### Events Fired

| Event | When |
|-------|------|
| `apply_pack_generated` | Every approval that generates a pack |
| `strong_fit_ready_to_apply` | Approval where fit_score ≥ 75 and recommended=true |
| `new_strong_fit` | Discovery run finds a strong-fit opportunity |

Configure destinations via `WEBHOOK_URL` (catch-all) or `WEBHOOK_URL_<EVENT_NAME>` env vars.

### What Still Requires Manual Action

- Resume tailoring (system provides direction, not final file edits)
- Personalising outreach drafts (review required before sending)
- Selecting and submitting the application (never automated)
- Verifying the apply URL is the correct ATS link
- Replacing `[bracketed]` placeholders in copy-ready blocks

### Pack Regeneration

Pack can be regenerated via the **🔄 Regenerate Pack** button when status is `apply_pack_generated`, `ready_to_apply`, or `approved`. Regeneration:
- Preserves resume version override history
- Preserves checklist done-state
- Records new `pack_version` and `last_regenerated_at`
- Records whether apply URL was missing at generation time (`apply_url_missing_at_generation`)

---

## 12. Continuity + Persistence + Premium Usability Layer (v4.0.0)

### What's New

1. **Copy-Ready Cover Note Block** — `copy_ready_cover_note_block` is now generated in every Apply Pack. 3-paragraph professional draft, clearly marked `[DRAFT]`. Suitable for ATS text fields or email introductions.

2. **Pack Readiness Score — Persisted** — `pack_readiness_score` is now embedded in the pack object and persisted on the opportunity record (`pack_readiness_score` field). Score updates when pack is generated or regenerated. Used in dashboard/reporting to identify most-ready roles.

3. **Apply Pack Auto-Refresh on Apply URL Add** — When a role was approved without an apply URL (`apply_url_missing_at_generation = true`), adding the URL later now **automatically regenerates the pack** with the URL included. Override history, checklist progress, and audit trail are all preserved. `regeneration_reason = 'apply_url_added'` is recorded.

4. **Print / Save as PDF** — "🖨 Print / Save PDF" button calls `window.print()`. `@media print` CSS in `style.css` hides navigation chrome and formats the pack as a clean printable document.

5. **Server-Side Discovery Profile Persistence** — Profile is now persisted to Supabase via `/profile` endpoint.

### Migration Required

Run migration `003_user_preferences.sql` in Supabase to create the `user_preferences` table:

```sql
-- Run in Supabase SQL editor or via migration CLI
-- supabase/migrations/003_user_preferences.sql
```

### Discovery Profile — Live Mode

In live mode, the discovery profile is loaded from `GET /.netlify/functions/profile` and saved via `POST /.netlify/functions/profile`. localStorage is kept as an offline cache/fallback. Demo mode continues to use localStorage only.

### Apply Pack Print View

The Apply Pack page now has a "🖨 Print / Save PDF" button. Clicking it opens the browser print dialog. The `@media print` CSS in `src/style.css` hides buttons, nav, and action bars, leaving only the pack content in a clean printable layout. Use the browser's "Save as PDF" option to produce a PDF.

### Exports Available (Apply Pack)

| Export | Format | Includes |
|---|---|---|
| 🖨 Print / Save PDF | Browser print / PDF | All visible pack content, print-formatted |
| 📄 Export Text Pack | `.txt` download | Role header, URLs, resume rec, all copy-ready blocks, keywords, checklist, follow-up date |
| ⬇ Export JSON | `.json` download | Full machine-readable pack |

### What Still Requires Manual Action

- Resume tailoring (system provides direction and copy-ready emphasis block)
- Cover note personalisation (replace bracketed placeholders with real experience)
- Application submission (never automated)
- Outreach sending (draft provided; sending requires human decision)
- Follow-up scheduling (system suggests date; user marks steps)

---

## Prioritization + Actionability Layer (v5.0)

### Readiness-Based Sorting (Tracker)

The Tracker now defaults to **Readiness sort** instead of fit score. This surfaces "Ready to Apply" roles at the top.

Sort options:
- 🎯 **Readiness** (default) — Ready → Follow-up Due → Needs URL → Needs Approval → In Progress → Low Priority
- ⭐ **Fit Score** — descending fit score
- 📋 **Status** — alphabetical status

Each row shows a **Readiness Badge** with a tooltip explaining the blocked state (e.g., "Blocked: apply URL not yet added").

### Action Center (Dashboard)

The Dashboard's first panel after the stats row is the **Action Center**. It lists up to 5 prioritized actions, e.g.:
- ✅ "2 roles are ready to apply now" → links to top-ready opportunity
- ⏰ "1 applied role needs follow-up" → links directly to the opportunity
- 🔗 "3 approved roles blocked — missing apply URL"
- ⭐ "2 high-fit roles waiting for approval"

Logic: `getBestNextActions(opps)` in `netlify/functions/_shared/readiness.js`.

### Weekly Digest — Readiness Summary

`GET /digest?type=weekly` now includes a `readiness` field:

```json
{
  "readiness": {
    "readyToApplyCount": 2,
    "highReadinessCount": 1,
    "blockedByMissingUrlCount": 3,
    "needsApprovalCount": 4,
    "appliedFollowUpDueCount": 1,
    "topReadyToApply": [...]
  }
}
```

### Profile Merge / Sync Safety

When you load the Discovery Profile page in live mode:
1. The system fetches both the **server profile** and **local profile**
2. If they differ, a conflict resolution panel appears
3. You choose: **Keep Server Profile** or **Keep Local Profile**
4. The chosen profile becomes the new source of truth in both locations

This prevents silent overwrites when using multiple devices or browsers.

### Print / Export Polish (Apply Pack)

Text export now includes:
- `Generated: [timestamp] — AI Job Search System (Sample Candidate)` footer line

Browser print now:
- Sets `data-print-timestamp` attribute on `<html>` for `@page` footer
- `@page` CSS adds "AI Job Search System" footer and page numbers (in supporting browsers)
- `body::after` provides fallback footer for browsers without `@page` support

### New Shared Module

`netlify/functions/_shared/readiness.js` — exports:
- `classifyReadinessGroup(opp)` — returns one of 6 READINESS_GROUPS values
- `getReadinessReason(opp)` — human-readable blocked-state explanation
- `groupByReadiness(opps)` — groups and sorts array of opportunities
- `getBestNextActions(opps)` — Action Center action list
- `computeReadinessSummary(opps)` — digest-ready summary object
- `READINESS_GROUPS`, `READINESS_GROUP_LABELS`, `READINESS_GROUP_ORDER`

### What Still Requires Manual Action

All previous manual-only actions remain unchanged. The prioritization layer provides decision support, not automation:
- Application submission is never automated
- Approval remains mandatory for every role
- Readiness classification does not bypass any approval requirement

---

## v6.0 Changes — PWA + Approval Queue + Reports + Batch URL + History

### PWA / Installability

The app now satisfies PWA installability criteria.

Files added:
- `public/manifest.json` — Web App Manifest
- `public/sw.js` — Service Worker
- `public/icon-192.png` — 192×192 app icon
- `public/icon-512.png` — 512×512 app icon (also maskable)
- `public/apple-touch-icon.png` — 180×180 iOS icon

`index.html` now includes:
- `<link rel="manifest" href="/manifest.json">`
- `<meta name="theme-color" content="#1e3a5f">`
- `<link rel="apple-touch-icon" ...>`
- Service worker registration script

**Service worker caching strategy:**
- App shell (HTML/JS/CSS): Stale-While-Revalidate
- Fonts: Cache First
- Netlify Functions (all `/.netlify/functions/*`): Network Only — live data is never cached

**IMPORTANT:** If you update the app, increment `CACHE_NAME` in `public/sw.js` to bust the shell cache.

### Approval Queue Readiness Layer

`ApprovalQueue.jsx` now shows:
- ReadinessBadge per pending role (reason + score)
- Grouped tiers: High-Fit → Standard → Weak Fit
- Sort by Fit Score or Readiness
- Missing-URL warning inline per role
- Approval gate reminder remains unchanged

### Reports — Readiness Panel

New "Readiness Panel" tab added to `/reports` (default view).
Shows live readiness counts and role lists from `state.opportunities`.
No API call required — uses `computeReadinessSummary()` from `_shared/readiness.js`.

### Follow-up Alert Banner

`Dashboard.jsx` now shows a dismissable banner when any opportunity has `next_action_due` within the next 2 days. Banner is session-dismissed only (no localStorage persistence). No fake urgency.

### Batch Apply URL Add

`BatchUrlPanel.jsx` (new component) provides a multi-record URL input form:
- Only shows roles in NEEDS_APPLY_URL group
- Calls `updateApplyUrl()` per record (full auditability preserved)
- Surfaced in `Tracker.jsx` via a contextual banner when blocked roles exist

`api.js` exports: `batchUpdateApplyUrls(entries)`

### Readiness History

`api.js` exports:
- `recordReadinessHistory(oppId, eventType, payload)` — writes to localStorage (demo) or Supabase (live)
- `getReadinessHistory(oppId, limit)` — reads history

Supabase migration: `supabase/migrations/004_readiness_history.sql`

Events tracked: `status_changed`, `apply_url_added`, `pack_regenerated`, `approval_state_changed`, `readiness_score_changed`

### Verification

`scripts/verify.js` now has **465 tests** across **18 sections**.

Section 18 covers: manifest, service worker, icons, approval queue readiness, reports readiness panel, follow-up banner, batch URL panel, readiness history, hierarchy guard, approval guard.

Run: `node scripts/verify.js`

---

## v5.0 — Production-Hardening + Continuity Layer

### Deploy Blocker Fix (Reports.jsx)

`src/pages/Reports.jsx` had a duplicate `export default function Reports()` that caused Netlify build failures. The duplicate (the older version without ReadinessPanel) has been removed. The canonical version with ReadinessPanel, readiness digest type, and full weekly digest is preserved.

**Verification:** `grep -c "export default function" src/pages/Reports.jsx` must return `1`.

### Readiness History Wiring

All key call sites now automatically record readiness history:

| Function | Events recorded |
|---|---|
| `approveOpportunity()` | `approval_state_changed`, `status_changed`, `pack_regenerated` |
| `updateApplyUrl()` | `apply_url_added`, `readiness_score_changed`, `pack_regenerated` |
| `updateApplyStatus()` | `status_changed` |

**Server-side (Supabase live):** `netlify/functions/_shared/db.js` now exports `insertReadinessHistory()` and `listReadinessHistory()`. These are wired into `approve.js` and `opportunities.js`. History writes are non-fatal — failures log a warning and do not block the primary operation.

**Client-side (demo/localStorage):** `src/lib/api.js` `recordReadinessHistory()` is called at the same points.

**Supabase migration required:** `supabase/migrations/004_readiness_history.sql` (already present).

### Opportunity Detail — Activity Timeline

`OpportunityDetail.jsx` now shows a `ReadinessTimeline` component in the sidebar when history exists for the opportunity. Events are displayed newest first with icons, labels, from→to transitions, and dates.

### Offline Fallback

`public/offline.html` added — an honest offline page that explains live data is unavailable.

`public/sw.js` updated:
- Cache name bumped to `job-search-os-shell-v2` (busts old shell cache on upgrade)
- `/offline.html` added to `SHELL_ASSETS`
- Navigation requests now fall back to `/offline.html` when fully offline
- API strategy unchanged: Network Only

### Tracker — Readiness Group Filter

`src/pages/Tracker.jsx` now has a **Readiness Group** dropdown filter:
- State: `readinessFilter` / `setReadinessFilter`
- Options: All groups, Ready to Apply, Follow-up Due, Needs URL, Needs Approval, In Progress, Low Priority
- Uses `classifyReadinessGroup()` — same shared logic, no second engine

### n8n Workflow Assets

New workflow files added:

| File | Trigger | Purpose |
|---|---|---|
| `n8n/workflows/06-daily-approval-digest.json` | Daily schedule + manual | Fetches approval digest, formats summary |
| `n8n/workflows/07-weekly-readiness-summary.json` | Weekly schedule + manual | Fetches weekly digest with readiness counts |

Both use `$env.SITE_URL` for the Netlify URL. Neither re-implements business logic.
Discovery workflow (`05-job-discovery.json`) remains unchanged and requires `DISCOVERY_SECRET`.

### Verification

`scripts/verify.js` now has **520 tests** across **19 sections**.

Section 19 covers: Reports.jsx duplicate export fix, no other duplicate exports, readiness history wiring in api.js + approve.js + opportunities.js, OpportunityDetail timeline, db.js live path, sw.js offline fallback, offline.html, Tracker readiness filter, n8n workflow assets, readiness history logic, hierarchy guard, approval gate.

Run: `node scripts/verify.js`
