# MAX_AUTOMATION_README.md — AI Job Search OS for Sample Candidate

## What is automated now

| Capability | Automated by |
|---|---|
| Feed polling (RSS/Atom, every 2h) | n8n → Netlify ingest-scheduled function |
| Job ingestion (normalization, dedup, scoring, classification) | Netlify ingest-scheduled → `_shared/scoring.js` + `_shared/dedup.js` |
| Fit scoring and lane classification | `_shared/scoring.js` (TPM > Delivery > Ops conditional > Program Manager selective) |
| Duplicate detection | `_shared/dedup.js` (content hash, idempotent) |
| Recommendation flag | `scoreOpportunity()` in `_shared/scoring.js` |
| Staleness / ghosted detection | `_shared/stale.js`, scanned on demand and by n8n workflow 02 |
| Approval queue digest | `/digest?type=approval` API endpoint + n8n workflow 02 |
| Stale reminder digest | `/digest?type=stale` API endpoint + n8n workflow 02 (daily 08:00) |
| Source health monitoring | `/sources` API endpoint + n8n workflow 03 (every 6h) |
| Source failure alerting | n8n workflow 03 → `webhooks` endpoint → Zapier/email |
| Weekly conversion summary | `/digest?type=weekly` + n8n workflow 04 (Monday 09:00) |
| Preparation package generation | `/prep?id=<id>` endpoint + `_shared/prep.js` |
| **Real job discovery — Greenhouse** | **`discover.js` + `_shared/jobFinder.js` → Greenhouse public boards API (no auth required)** |
| **Real job discovery — Lever** | **`discover.js` + `_shared/jobFinder.js` → Lever public postings API (no auth required)** |
| **Real job discovery — USAJobs** | **`discover.js` + `_shared/jobFinder.js` → USAJobs REST API (requires USAJOBS_API_KEY)** |
| **Real job discovery — RSS/Atom** | **`ingest-scheduled.js` → RSS/Atom feeds (SEEK, APSJobs) with `jobFinder.fetchRSSFeed()`** |
| **Discovery profile filtering** | **`_shared/sources.js` → `passesDiscoveryProfile()` — title include/exclude, domain exclude, pre-score filter** |
| **canonical_job_url + application_url stored** | **On every discovered opportunity — `_shared/jobFinder.normaliseJob()`** |
| **Demo record isolation** | **All demo records have `is_demo_record: true`, `source_family: 'demo'`, no example.com URLs** |
| **Apply Pack generation (auto on approval)** | **`approve.js` → `_shared/applyPack.js` — generated immediately when role is approved** |
| **Resume version recommendation** | **`_shared/scoring.js` → `recommendResumeVersion()` — TPM-BASE-01 / DEL-BASE-01 / OPS-COND-01 / MASTER-01** |
| **Keyword mirror list** | **`_shared/prep.js` → `extractKeywords()` (bigram + unigram frequency)** |
| **Apply checklist** | **`_shared/applyPack.js` → `generateApplyChecklist()` — 9-step lane-aware checklist** |
| **Follow-up date suggestion** | **`_shared/applyPack.js` → `suggestFollowUpDate()` — 7–14 days based on fit score** |
| **Outreach drafts** | **`_shared/prep.js` — recruiter + hiring manager drafts, personalised per lane** |
| **Bullet emphasis notes** | **`_shared/applyPack.js` — 5 lane-specific resume bullet guidance notes** |
| Outbound webhook dispatch | `/webhooks` endpoint (fired by n8n, consumed by Zapier) |
| Export / backup trigger | `/export?format=json|csv` endpoint + UI buttons on Reports page |
| **Apply Pack JSON export** | **`/apply-pack/:id` page → Export Pack JSON button (includes canonical_job_url)** |
| Reports page | `/reports` — live digests, funnel, export buttons |

## What still requires human approval

| Action | Why approval required |
|---|---|
| Opportunity approval (approve/reject) | Core product constraint — no role bypasses the approval queue |
| Apply Pack is only generated AFTER approval | The approval gate blocks the pack — pending/rejected roles cannot get a pack |
| Application submission | Must not be automated — human sends every application via "Open Apply URL ↗" |
| Outreach sending | Recruiter and hiring manager drafts are generated but never auto-sent |
| Resume customisation | Keyword mirror + emphasis direction are generated; human applies them to resume files |
| Resume source file editing | The system never edits, mutates, sample-resume.pdf/.pdf resume files |
| Resume version override | Human may override the system recommendation; override is audited and preserved |

## The apply flow (find → score → approve → prepare → apply → track)

```
1. DISCOVER   Job found via Greenhouse / Lever / USAJobs / RSS — canonical_job_url stored
2. QUEUE      Recommended jobs enter approval queue (profile-filtered, scored, classified)
3. APPROVE    Human approves or rejects each role
4. PACK READY Apply Pack auto-generated: resume recommendation + checklist + keywords + outreach drafts
5. PREPARE    Human tailors resume using the pack — "Open Original Posting" + "Open Apply URL" buttons ready
6. APPLY      Human submits application manually via the original posting URL
7. TRACK      Status updated: follow_up_1 → follow_up_2 → interviewing → offer/rejected/ghosted
```

## Real Job Finder

The system discovers real jobs from governed structured sources. No scraping, no automation, no LinkedIn.

### Supported source families

| Source family | How it works | Auth |
|---|---|---|
| `greenhouse` | Greenhouse public boards JSON API — `boards-api.greenhouse.io/v1/boards/{token}/jobs` | None (public) |
| `lever` | Lever public postings JSON API — `api.lever.co/v0/postings/{slug}` | None (public) |
| `usajobs` | USAJobs REST API — `data.usajobs.gov/api/search` | USAJOBS_API_KEY required |
| `seek` | SEEK RSS/Atom feed | None (public) |
| `apsjobs` | Australian Public Service Jobs RSS | None (public) |
| `rss` | Any approved RSS/Atom feed | None |
| `linkedin` | NOT automated. Email intake only — no browser automation, no scraping. | N/A |

### env vars required per source family

```
GREENHOUSE_BOARDS=telstra,anz,atlassian      # comma-separated board tokens
LEVER_BOARDS=canva,xero,atlassian            # comma-separated company slugs
USAJOBS_API_KEY=your-key                     # from developer.usajobs.gov
USAJOBS_USER_AGENT=your-registered-email     # must match API key registration
LIVE_INTAKE_ENABLED=true                     # global kill switch — must be true
```

### Discovery profile (Candidate's filter)

Before scoring, every discovered job is filtered by `passesDiscoveryProfile()` in `_shared/sources.js`.

- **Include titles**: Technical Project Manager, IT Project Manager, Delivery Manager, Senior Project Manager, Programme Manager
- **Exclude titles**: junior, graduate, assistant, coordinator, entry level, marketing, sales, HR, change manager
- **Exclude domains**: construction, civil engineering, mining, manufacturing, retail operations, FMCG

This ensures the approval queue is high-signal before scoring even runs.

### Real URL model

Every discovered job stores:

| Field | Meaning |
|---|---|
| `canonical_job_url` | The canonical link to the original job posting |
| `application_url` | The apply link (may differ from canonical, e.g. ATS redirect) |
| `source_job_id` | The unique job ID from the source ATS/feed |
| `source_family` | `greenhouse`, `lever`, `usajobs`, `seek`, `rss`, etc. |
| `is_demo_record` | `false` for all discovered jobs; `true` for demo seed records only |

### Demo mode vs live mode

| Behaviour | Demo mode | Live mode |
|---|---|---|
| Source of jobs | Pre-seeded demo records in `demoData.js` | Real discovered jobs from approved sources |
| `is_demo_record` | `true` — all demo records | `false` — all discovered jobs |
| URLs | Real company careers pages (no example.com) — clearly labeled as demo | Real canonical_job_url and application_url from source |
| "Open Original Posting" | Disabled — demo label shown | Enabled — opens real posting |
| Discovery runs | Skipped | Enabled when `LIVE_INTAKE_ENABLED=true` |

Demo records are permanently labeled and isolated. The UI shows a `DEMO` badge and disables posting links.
Demo records will never show `example.com` links — they use real careers page URLs as reference.

## Apply Pack contents

| Field | What it contains |
|---|---|
| `recommended_resume_version` | TPM-BASE-01 / DEL-BASE-01 / OPS-COND-01 / MASTER-01 |
| `recommendation_confidence` | high / medium / low |
| `recommendation_reason` | Why this version was selected |
| `keyword_mirror_list` | Top 20 keywords/bigrams extracted from job description |
| `proof_points_to_surface` | Lane-specific bullet evidence to include in resume |
| `summary_direction` | How to position the resume summary for this role |
| `bullet_emphasis_notes` | 5 lane-specific instructions for resume bullets |
| `recruiter_outreach_draft` | Personalised recruiter outreach ready to customise |
| `hiring_manager_outreach_draft` | HM outreach after applying |
| `apply_checklist` | 9-step apply workflow checklist with done-state tracking |
| `suggested_follow_up_date` | YYYY-MM-DD follow-up reminder (7–14 days based on fit score) |
| `role_snapshot` | Frozen snapshot of title, company, lane, fit_score at generation time |
| `pack_version` | Increments on regeneration |
| `resume_version_override` | Null unless human overrides; override reason + timestamp preserved |
| `original_system_recommendation` | Never overwritten — always the system's original pick |

The Apply Pack page includes:
- **📄 Open Original Posting ↗** — opens `canonical_job_url` in new tab
- **✅ Open Apply URL ↗** — opens `application_url` if distinct from canonical
- Demo records show a warning instead: no live application URL

## Resume version hierarchy

| Version | When to use |
|---|---|
| `TPM-BASE-01` | TPM lane, score ≥ 60 |
| `DEL-BASE-01` | Delivery Manager lane, score ≥ 55 |
| `OPS-COND-01` | Ops Manager conditional lane, score ≥ 65 (with or without tech signals) |
| `MASTER-01` | Fallback for low scores, generic lanes, or multi-lane ambiguity |

Do NOT use MASTER-01 for strong TPM or DM roles — specificity is the whole point.


| Source enablement | Each new live source must be manually enabled per source |
| Live intake kill switch | Global intake toggle is a manual env var / UI control |

## Tools used and what each does

| Tool | Role |
|---|---|
| **Netlify Functions / Node.js API** | Brain: all scoring, dedup, classification, recommendation, digest, prep, webhook dispatch, export |
| **n8n** | Orchestration backbone: scheduled polling, calling API endpoints, triggering webhooks |
| **Zapier** | Convenience notification layer: receives webhooks from API, sends emails/calendar reminders |
| **Make.com** | Not in use — not needed. See `AUTOMATION_STACK_DECISION.md`. |
| **Supabase** | Database: opportunities, sources, ingestion_logs (optional — falls back to demo mode without it) |
| **Netlify** | Hosting + serverless functions |

## How the layers interact

```
n8n (schedule trigger)
  │
  ├─→ GET /.netlify/functions/sources          (check live kill switch)
  │
  ├─→ POST /.netlify/functions/ingest-scheduled  (triggers full pipeline)
  │         ↓
  │    dedup.js → scoring.js → db.js → logIngestion()
  │
  ├─→ GET /.netlify/functions/digest?type=approval  (daily)
  │         ↓
  │    returns computed queue summary (no logic in n8n)
  │
  ├─→ POST /.netlify/functions/webhooks  (fire outbound event)
  │         ↓
  │    dispatches to WEBHOOK_URL (consumed by Zapier)
  │         ↓
  │    Zapier → Gmail / Slack / Calendar reminder
  │
  └─→ GET /.netlify/functions/digest?type=weekly  (Monday)

Website (React SPA)
  │
  ├─→ /queue    — Approval Queue (human approves/rejects)
  ├─→ /tracker  — All opportunities with staleness flags
  ├─→ /sources  — Source health table
  ├─→ /reports  — Digests + Export buttons
  └─→ /opportunity/:id  — Detail + Prep Package panel (generated on demand)
```

## Candidate truth hierarchy (locked, non-negotiable)

1. **Technical Project Manager** — primary lane (highest score ceiling)
2. **Delivery Manager** — secondary lane
3. **Operations Manager** — conditional only (requires technical-ops / readiness / compliance signals)
4. **Program Manager** — selective only (requires governance-heavy technical signals)
5. Generic PM / generic Ops — low fit, suppressed

All scoring logic lives exclusively in `netlify/functions/_shared/scoring.js`.
No other file, workflow, or tool re-implements this logic.

---

## Apply Pack — Copy-Ready Content (v4.0.0)

Every approved opportunity now generates an Apply Pack that includes directly usable draft content:

### Copy-Ready Blocks

| Block | What it is | Status |
|---|---|---|
| `copy_ready_summary_block` | Application summary draft — aligned to lane and role | ✅ Auto-generated |
| `copy_ready_resume_emphasis_block` | Lead-with themes and proof points for resume tailoring | ✅ Auto-generated |
| `copy_ready_cover_note_block` | 3-paragraph cover note draft for ATS fields or email | ✅ Auto-generated |

All blocks are clearly marked `[DRAFT — review and personalise before use]`.
They are starting points, not finished statements. No claims are fabricated.
Replace bracketed placeholders with your real experience.

### Pack Readiness Score

- `pack_readiness_score` (0–100) is now **embedded in the pack** and **persisted on the opportunity record**
- Reflects: resume recommendation presence, keyword count, proof points, copy-ready blocks, apply URL, checklist progress
- Displayed in the Apply Pack UI and included in text exports
- Updates when the pack is regenerated (e.g. after apply URL is added)

### Pack Auto-Refresh on Apply URL Add

When a manual external role is approved without an apply URL:
1. Status is set to `needs_apply_url`
2. User adds apply URL later (via Apply Pack banner or Opportunity Detail)
3. System **automatically regenerates the pack** using the new URL
4. Override history, checklist progress, and audit trail are preserved
5. Pack version increments and `regeneration_reason = 'apply_url_added'` is recorded

### Print / Export Options

| Export path | How to access |
|---|---|
| **Browser print / Save as PDF** | "🖨 Print / Save PDF" button in action bar or Copy-Ready tab |
| **Text bundle (.txt)** | "📄 Export Text Pack" button — includes all blocks, keywords, checklist, follow-up date |
| **JSON export** | "⬇ Export Pack JSON" button — machine-readable full pack |

Print view hides navigation chrome. Use browser "Save as PDF" for a clean document.

---

## Discovery Profile — Server-Side Persistence

The discovery profile is now **server-persisted** in live mode.

- **Endpoint:** `GET /profile` (load) + `POST /profile` (save)
- **Database:** `user_preferences` table (`supabase/migrations/003_user_preferences.sql`)
- **Fallback:** localStorage is always kept as an offline backup
- **Demo mode:** continues to use localStorage as before

### Behaviour

- In live mode: profile loads from server on page open, saves to server on save
- If server save fails: localStorage copy is preserved and user is notified
- Profile is not forked — the same `DEFAULT_DISCOVERY_PROFILE` shape is used as the base

---

## Events / Notifications

Events fired automatically:

| Event | When | Threshold |
|---|---|---|
| `apply_pack_generated` | On approval, when pack is generated | Always |
| `strong_fit_ready_to_apply` | On approval | fit_score ≥ 75 AND recommended=true |
| `new_strong_fit` | On discovery ingestion | fit_score ≥ 75 AND recommended=true |
| `stale_reminder` | Via stale scan | Configured staleness window |

All events are no-op if webhook URLs are not set.

---

## What Is Still Manual

| Step | Why it's manual |
|---|---|
| Resume tailoring | Requires human judgment — blanket edits risk quality |
| Cover note personalisation | Bracketed sections require candidate-specific input |
| Application submission | Never automated — approval and submission remain human decisions |
| Outreach sending | Draft is generated; sending requires human review |
| Follow-up scheduling | System suggests date; user marks follow-up steps |
