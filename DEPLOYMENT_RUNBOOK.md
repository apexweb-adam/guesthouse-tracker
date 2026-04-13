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

| Variable | Value |
|---|---|
| `VITE_DEMO_MODE` | `false` |
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `LIVE_INTAKE_ENABLED` | `false` (keep OFF until sources verified) |

### 3d. Redeploy

```bash
netlify deploy --prod
```

---

## 4. Enabling Live Source Intake

> **WARNING:** Only enable after you have verified your RSS/API sources return valid structured data.

1. Set `LIVE_INTAKE_ENABLED=true` in Netlify environment variables
2. Go to Sources page → enable individual RSS/API sources
3. The scheduled function (`ingest-scheduled`) runs every 2 hours automatically
4. Monitor the Sources page for ingestion health and failure counts

**Kill switch:** Set `LIVE_INTAKE_ENABLED=false` and redeploy to immediately stop all automated intake.

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
