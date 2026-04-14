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
| Outbound webhook dispatch | `/webhooks` endpoint (fired by n8n, consumed by Zapier) |
| Export / backup trigger | `/export?format=json|csv` endpoint + UI buttons on Reports page |
| Reports page | `/reports` — live digests, funnel, export buttons |

## What still requires human approval

| Action | Why approval required |
|---|---|
| Opportunity approval (approve/reject) | Core product constraint — no role bypasses the approval queue |
| Application submission | Must not be automated — human sends every application |
| Outreach sending | Recruiter and hiring manager drafts are generated but never auto-sent |
| Resume customisation | Keyword mirror + emphasis direction are generated; human applies them |
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
