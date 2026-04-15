# Job Search OS

**Approval-based job search operating system for Sample Candidate.**

A website-centred, automated-intake, human-approval job search system. Not a blind auto-apply bot.

---

## What This Is

An operating system for a structured job search:

- **Automated:** intake, normalisation, deduplication, classification, fit scoring, recommendation, stale/ghosted detection, follow-up scheduling, source health monitoring
- **Human-controlled:** role approval, resume emphasis choice, outreach, application submission, all overrides

---

## Quick Add from External Posting

When you find a role manually on LinkedIn or another site, use **Quick Add Job** to bring it into the system without leaving your workflow.

**How it works:**
1. Copy the reference URL (LinkedIn, company site, job board)
2. Paste the full job description text
3. Optionally paste the direct apply URL (ATS/company link)
4. Submit — the system scores, classifies, and queues the role for your approval
5. After approval, Apply Pack is auto-generated

**LinkedIn URL handling (safe):**
- LinkedIn URLs are stored as `reference_posting_url` only
- The system does NOT fetch or scrape LinkedIn
- You must paste the JD text manually — the system cannot infer content from a URL alone
- If you have a direct company apply URL, paste it in the "Apply URL" field

**Missing apply URL:**
- If no apply URL is provided, the status advances to `needs_apply_url` after approval
- The Apply Pack checklist will surface "Find / add official apply URL" as a blocking item
- You can add the URL inline from Opportunity Detail or the Apply Pack page

**Compact Quick Add widget:**
- Available on the Dashboard — expands inline without navigating away
- Supports all required fields: reference URL, title, company, JD text, optional apply URL

**Workflow:**
```
find role → paste into Quick Add → auto-score → approve (→ Apply Pack generated)
→ if no apply URL: needs_apply_url → add URL → ready_to_apply → apply → track
```

---
## Candidate Truth (Locked)

This system is built around Sample Candidate actual strongest positioning.

**Non-negotiable hierarchy:**
1. **Technical Project Manager (TPM)** — Primary lane, maximum fit score ceiling
2. **Delivery Manager** — Secondary lane
3. **Operations Manager** — Conditional only (technical-ops / readiness / compliance-heavy roles only)
4. **Program Manager** — Selective only (governance-heavy technical scope required)
5. **Generic PM / Ops** — Low fit unless strong signals

This hierarchy is enforced in code (`netlify/functions/_shared/scoring.js`) and validated in tests (`scripts/verify.js`).

---

## Quick Start

```bash
# Install
npm install

# Run (demo mode — no backend needed)
VITE_DEMO_MODE=true npm run dev

# Run tests
npm test
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| API | Netlify Functions (ES modules) |
| Persistence (production) | Supabase (PostgreSQL) |
| Persistence (demo) | localStorage |
| Scheduling | Netlify Scheduled Functions |
| Hosting | Netlify |

---

## Architecture

```
Browser (React + Vite)
  └── calls /.netlify/functions/* (API)
                └── netlify/functions/_shared/ (business logic)
                      ├── scoring.js        ← THE single source of truth for scoring
                      ├── classification.js ← (exported from scoring.js)
                      ├── dedup.js          ← deduplication
                      ├── stale.js          ← stale/ghosted detection
                      ├── sources.js        ← source governance + kill switch
                      └── db.js             ← Supabase client + demo fallback

Netlify Scheduled Functions:
  ├── ingest-scheduled.js   → every 2h, live sources (when LIVE_INTAKE_ENABLED=true)
  └── stale-scan-scheduled.js → daily 08:00 UTC
```

The frontend can also import `scoring.js`, `dedup.js`, and `stale.js` directly for client-side scoring in demo mode. `db.js` is server-side only.

---

## Environment Variables

See `.env.example` for all variables.

Key variables:
- `VITE_DEMO_MODE=true` — forces demo mode (no backend)
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — production persistence
- `LIVE_INTAKE_ENABLED=true` — enables automated RSS/API source intake (OFF by default)

---

## What Is NOT Supported

- LinkedIn automation
- Browser-bot application flows
- Arbitrary scraping
- Blind auto-apply
- Any unsupported platform extraction

---

## Deployment

See `DEPLOYMENT_DECISION.md` and `DEPLOYMENT_RUNBOOK.md`.

**TL;DR:**
1. Push to GitHub → connect to Netlify → add `VITE_DEMO_MODE=true` → deploy
2. Demo preview works immediately, no credentials needed
3. For production: add Supabase credentials, set `VITE_DEMO_MODE=false`

---

## Prioritization + Action Center

The system now provides operational decision-support, not just tracking.

### What `pack_readiness_score` powers

`pack_readiness_score` (0–100%) is computed when an Apply Pack is generated and persisted on the opportunity record.

It reflects:
- Whether an apply URL is confirmed
- Whether all copy-ready blocks are generated
- Resume recommendation confidence
- Pack version completeness

It drives:
- **Dashboard Action Center** — "What to do right now" view
- **Tracker readiness sort** — default sort by readiness, not just fit score
- **Digest/reporting** — weekly readiness summary in `/digest?type=weekly`

### Readiness Groups

Opportunities are classified into one of:

| Group | Meaning |
|---|---|
| Ready to Apply Now | Approved + apply URL confirmed + readiness ≥ 70% |
| Needs Apply URL | Approved but apply URL not yet added — blocked |
| Needs Approval / Review | Pending your approval decision |
| Applied — Follow-up Due | Applied and follow-up due within 2 days |
| In Progress | Active but not yet ready or awaiting interview outcome |
| Low Priority / Weak Fit | Below recommendation threshold or closed |

Use `classifyReadinessGroup(opp)` from `_shared/readiness.js` for consistent classification across all surfaces.

### Action Center

The Dashboard shows an Action Center panel listing the best next actions, e.g.:
- "3 roles are ready to apply now"
- "2 approved roles only need an apply URL"
- "1 applied role needs follow-up today"

This panel is driven by `getBestNextActions(opps)` from `_shared/readiness.js`.

### Discovery Profile Sync

The Discovery Profile is server-persisted (Supabase `user_preferences` table).

If you use multiple devices and the local and server profiles differ, the system detects this on load and shows a conflict resolution UI — let you choose "Keep Server" or "Keep Local". Neither is silently overwritten.

### Apply Pack Print / Export

The Apply Pack can be:
- **Exported as .txt** — click "Export Text Pack" (includes generated timestamp and footer stamp)
- **Printed / Saved as PDF** — click "Print / Save PDF" (uses `@media print` styling with `@page` footer)

The print output includes all pack sections, readiness score, cover note block, checklist, and a generation timestamp.

---
