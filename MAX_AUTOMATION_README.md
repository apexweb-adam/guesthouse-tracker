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
| **Apply Pack generation (auto on approval)** | **`approve.js` → `_shared/applyPack.js` — generated immediately when role is approved** |
| **Resume version recommendation** | **`_shared/scoring.js` → `recommendResumeVersion()` — TPM-BASE-01 / DEL-BASE-01 / OPS-COND-01 / MASTER-01** |
| **Keyword mirror list** | **`_shared/prep.js` → `extractKeywords()` (bigram + unigram frequency)** |
| **Apply checklist** | **`_shared/applyPack.js` → `generateApplyChecklist()` — 9-step lane-aware checklist** |
| **Follow-up date suggestion** | **`_shared/applyPack.js` → `suggestFollowUpDate()` — 7–14 days based on fit score** |
| **Outreach drafts** | **`_shared/prep.js` — recruiter + hiring manager drafts, personalised per lane** |
| **Bullet emphasis notes** | **`_shared/applyPack.js` — 5 lane-specific resume bullet guidance notes** |
| Outbound webhook dispatch | `/webhooks` endpoint (fired by n8n, consumed by Zapier) |
| Export / backup trigger | `/export?format=json|csv` endpoint + UI buttons on Reports page |
| **Apply Pack JSON export** | **`/apply-pack/:id` page → Export Pack JSON button** |
| Reports page | `/reports` — live digests, funnel, export buttons |

## What still requires human approval

| Action | Why approval required |
|---|---|
| Opportunity approval (approve/reject) | Core product constraint — no role bypasses the approval queue |
| Apply Pack is only generated AFTER approval | The approval gate blocks the pack — pending/rejected roles cannot get a pack |
| Application submission | Must not be automated — human sends every application |
| Outreach sending | Recruiter and hiring manager drafts are generated but never auto-sent |
| Resume customisation | Keyword mirror + emphasis direction are generated; human applies them to resume files |
| Resume source file editing | The system never edits, mutates, sample-resume.pdf/.pdf resume files |
| Resume version override | Human may override the system recommendation; override is audited and preserved |

## The apply flow (find → score → approve → prepare → apply → track)

```
1. DISCOVER   Job ingested → scored → classified → deduplicated
2. QUEUE      Recommended jobs enter approval queue
3. APPROVE    Human approves or rejects each role
4. PACK READY Apply Pack auto-generated: resume recommendation + checklist + keywords + outreach drafts
5. PREPARE    Human tailors resume using the pack, reviews outreach drafts
6. APPLY      Human submits application manually
7. TRACK      Status updated: follow_up_1 → follow_up_2 → interviewing → offer/rejected/ghosted
```

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
