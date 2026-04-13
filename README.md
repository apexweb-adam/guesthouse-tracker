# Job Search OS

**Approval-based job search operating system for Sample Candidate.**

A website-centred, automated-intake, human-approval job search system. Not a blind auto-apply bot.

---

## What This Is

An operating system for a structured job search:

- **Automated:** intake, normalisation, deduplication, classification, fit scoring, recommendation, stale/ghosted detection, follow-up scheduling, source health monitoring
- **Human-controlled:** role approval, resume emphasis choice, outreach, application submission, all overrides

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
