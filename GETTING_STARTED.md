# Getting Started — AI Job Search OS

**Built for:** Sample Candidate  
**Product:** Approval-based job search operating system  
**What it is:** A website where you manage your job search — not a bot that applies on your behalf.

---

## What This Product Does

This system helps you run a structured, high-quality job search without losing track of anything.

It automatically finds real jobs from tech-company job boards (Greenhouse and Lever), scores and ranks them for fit, and surfaces the best ones for your review. You approve or reject each role. Nothing is applied for automatically — ever.

**The system handles:**
- Finding real jobs from approved tech company boards (Greenhouse, Lever)
- Scoring every role for fit against your target: Technical Project Manager → Delivery Manager
- Deduplicating jobs so nothing appears twice
- Generating an Apply Pack for each approved role: resume guidance, keyword list, cover note draft, apply checklist
- Tracking your pipeline from discovery to offer or rejection
- Sending you a daily digest of what needs attention

**You handle:**
- Approving or rejecting each role
- Tailoring your resume for each approved role (the system gives you guidance — it doesn't edit your files)
- Submitting each application yourself via the official apply link
- Sending outreach (the system drafts it; you send it)

---

## Important Caveats

- **Cover note blocks and outreach drafts are DRAFTS.** They are marked `[DRAFT — review and personalise before use]`. Replace the bracketed sections with your own words before using.
- **The system never auto-applies.** Every application is submitted by you, manually, via the "Open Apply URL" button.
- **Apply Packs are generated after you approve a role.** Pending roles do not get packs.
- **LinkedIn is not automated.** If you find a role on LinkedIn, paste the job description into Quick Add manually. The system does not scrape LinkedIn.

---

## Two Parts of the Delivery

This delivery includes two parts:

1. **This web app (the operating system)** — hosted on Netlify, connected to Supabase. This is the live product you use every day.
2. **A separate documents folder** — contains your resume base files, naming conventions, and reference materials that the system recommends. The web app and the documents folder are separate. The app tells you which resume version to use and what to emphasise — you then open the actual file yourself.

You need both. They are not connected technically — the web app refers to resume version names (e.g. `TPM-BASE-01`) and you keep the actual files wherever you store your documents.

---

## How to Access Your Site

Your site is deployed to Netlify. Once deployed:

- **App URL:** `[your-netlify-url].netlify.app` (or your custom domain if configured)
- **Current mode:** Demo mode (pre-seeded data, no live backend) or Live mode (Supabase + real discovery), depending on your environment setup.

Check `DEPLOYMENT_RUNBOOK.md` for complete deployment steps.

---

## First-Time Setup (Quick Path)

### To run in Demo Mode (no credentials needed):

```bash
npm install
VITE_DEMO_MODE=true npm run dev
```

Open http://localhost:5173. You'll see demo data — pre-seeded roles, an approval queue, tracker, and reports. All scoring and approval flows work. No backend needed.

### To go Live (Supabase + real job discovery):

1. Create a Supabase project and run all 4 migrations from `supabase/migrations/` in order
2. In Netlify: add env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `DISCOVERY_SECRET`
3. Set `VITE_DEMO_MODE=false` and `LIVE_INTAKE_ENABLED=true`
4. Set `GREENHOUSE_BOARDS` and/or `LEVER_BOARDS` to company slugs you've verified
5. Deploy to Netlify

Full steps: see `LIVE_ACTIVATION_RUNBOOK.md` (Greenhouse first) and `LEVER_ROLLOUT_RUNBOOK.md` (Lever second).

---

## What Each Page Does

| Page | What you do there |
|---|---|
| **Dashboard** | See today's action items and the Best New Roles panel — your daily starting point |
| **Approval Queue** | Approve or reject each role the system has recommended |
| **Tracker** | See all your active roles — filter by readiness, status, source |
| **Opportunity Detail** | Full role detail, activity timeline, status controls |
| **Apply Pack** | Resume recommendation, keyword list, cover note draft, apply checklist for an approved role |
| **Quick Add** | Paste in a role you found manually (LinkedIn, company site, anywhere) |
| **Import** | Upload a CSV of roles for bulk intake |
| **Sources** | See the health of your discovery sources — turn them on or off |
| **Reports** | Pipeline stats, source quality comparison, readiness breakdown, export |
| **Discovery Profile** | Edit your search criteria — title includes/excludes, domains to suppress |

---

## Job Discovery: What's Active

| Source | Status | Config var |
|---|---|---|
| Greenhouse (public board API) | Active when `GREENHOUSE_BOARDS` is set | `GREENHOUSE_BOARDS=atlassian,canva,...` |
| Lever (public postings API) | Active when `LEVER_BOARDS` is set | `LEVER_BOARDS=atlassian,canva,...` |
| USAJobs | Not activated in this rollout | — |
| SEEK / RSS | Not activated in this rollout | — |
| LinkedIn | Not automated — use Quick Add | — |

---

## Testing Without Breaking Anything

```bash
# Run all 636 automated tests
node scripts/verify.js

# Run a manual discovery check (live mode only)
./scripts/run-discovery.sh

# Check all live endpoints are healthy
./scripts/check-live.sh
```

---

## If Something Goes Wrong

**Disable all automated intake immediately:**
```bash
# In Netlify: set LIVE_INTAKE_ENABLED=false and redeploy
# OR via CLI:
netlify env:set LIVE_INTAKE_ENABLED false
```

**Remove bad pending records:**
```sql
DELETE FROM opportunities
WHERE is_demo_record = FALSE
  AND approval_state = 'pending'
  AND discovered_at > 'YYYY-MM-DD';
```

**Disable Lever only (keep Greenhouse running):**
```bash
# Remove LEVER_BOARDS from Netlify env vars and redeploy
# This disables Lever without touching Greenhouse
```

See `LEVER_ROLLOUT_RUNBOOK.md §8 Kill Switch` and `LIVE_ACTIVATION_RUNBOOK.md §7 Kill Switch` for full rollback procedures.

---

## Key Files for Reference

| File | What it covers |
|---|---|
| `DEPLOYMENT_RUNBOOK.md` | How to deploy to Netlify and configure Supabase |
| `LIVE_ACTIVATION_RUNBOOK.md` | Step-by-step Greenhouse live rollout + rollback |
| `LEVER_ROLLOUT_RUNBOOK.md` | Step-by-step Lever live rollout + rollback |
| `AUTOMATION_RUNBOOK.md` | How to enable/disable sources, n8n setup, rollback |
| `MAX_AUTOMATION_README.md` | Full automation capability reference |
| `SOURCE_GOVERNANCE.md` | Source allowlist, trust levels, kill switches |
| `.env.example` | All environment variables with descriptions |

---

## What This System Will Never Do

- Automatically submit applications
- Scrape LinkedIn or any unsupported platform
- Modify your resume files
- Send outreach on your behalf
- Apply to any role you have not personally approved
