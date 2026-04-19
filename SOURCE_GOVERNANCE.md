# SOURCE_GOVERNANCE.md

## Current Source Priority (Operating Truth)

| Source family | Status | Notes |
|---|---|---|
| `lever` | **Active — PRIMARY** | Lever is the highest-signal source for TPM/Delivery lanes. Set `LEVER_BOARDS` env var. |
| `greenhouse` | **Active — secondary** | Stable but more saturated. Set `GREENHOUSE_BOARDS` env var. |
| `rss` | Staged off | Code exists; feed support is built. Not activated — evaluate quality before enabling. |
| `usajobs` | Staged off | Code exists; requires `USAJOBS_API_KEY`. Not needed yet. |
| `linkedin` | Manual only | Not automated. No scraping. URL used as reference only in manual intake. |

> Source quality is an observed operational result, not a permanent truth. Re-evaluate Lever vs Greenhouse quality monthly via Reports → Source Quality. Lever is currently higher signal based on live discovery results; this may change as market conditions change.

---

## Source Activation Waves

Sources are activated in waves. Each wave requires the previous wave to be clean and stable before advancing. Do not skip steps or activate multiple new families simultaneously.

| Wave | Sources | Status | Activation gate |
|---|---|---|---|
| Wave 1 | Lever (primary) + Greenhouse (secondary) | **Active** | Proven. Lever live discovery works. Greenhouse live discovery works. Dedup works. |
| Wave 2 | USAJobs | **Staged — not activated** | Requires API key registration, manual run passing, dedup passing, quality evaluation. See §USAJobs prerequisites below. |
| Wave 3 | RSS / Atom curated feeds | **Staged — not activated** | Requires specific vetted feed URLs, manual run, quality evaluation. See §RSS prerequisites below. |
| Wave 4 | Additional structured ATS / public feeds | **Not evaluated** | Only after Wave 3 is proven clean and produces quality >50% recommended rate. |

**The goal is not to turn everything on. The goal is high-signal discovery with minimum queue pollution.**

### USAJobs Activation Prerequisites (Wave 2)

Do not activate USAJobs until all of the following are true:

1. **Register an API key** at https://developer.usajobs.gov/ — free account required
2. **Set env vars in Netlify:**
   - `USAJOBS_API_KEY=<your-key>`
   - `USAJOBS_USER_AGENT=<your-registered-email>`
   - `USAJOBS_KEYWORD=technical project manager` (optional; defaults to this if unset)
3. **Run one manual USAJobs-only discovery** and inspect results:
   ```bash
   ./scripts/run-discovery.sh --family=usajobs
   # or:
   curl -X POST $SITE_URL/.netlify/functions/discover \
     -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"sourceFamily":"usajobs"}'
   ```
4. **Check queue quality:** Open `/tracker` → confirm roles are real TPM/federal PM roles with valid USAJobs URLs (`usajobs.gov/...`)
5. **Run a second time** to verify dedup passes (zero re-ingest)
6. **Review Reports → Source Quality:** USAJobs must show ≥ 30% recommended rate with ≥ 5 records before keeping it on
7. **Only then enable the scheduled daily run** to include USAJobs

**USAJobs rollback:** Disable `src-usajobs` in the Sources UI or unset `USAJOBS_API_KEY`. All other sources continue unaffected.

**Quality threshold:** If USAJobs recommended rate < 30% with ≥ 10 records, disable it and review keyword / category configuration.

### RSS / Atom Activation Prerequisites (Wave 3)

Do not activate any RSS feed until:

1. **Wave 2 (USAJobs) is proven or explicitly skipped** — do not add RSS to an already noisy queue
2. **Vet the feed URL manually** — paste it in a browser and confirm it returns real PM/TPM job listings
3. **Only allowlisted structured public feeds** — do not add arbitrary URLs; each feed must be documented in `DEFAULT_SOURCES`
4. **Set `enabled: true`** for the specific feed in the Sources UI (each feed is individually controlled)
5. **Run one manual RSS-only discovery:**
   ```bash
   ./scripts/run-discovery.sh --family=rss
   ```
6. **Inspect quality:** confirm titles, descriptions, and canonical URLs are real, non-scraping structured data
7. **Verify dedup** with a second run before enabling schedule

**RSS rollback:** Disable the specific feed source in the Sources UI. Other feeds and all API sources continue unaffected.

---

## Source Quality Governance

Per source family, the following metrics are tracked and visible in Reports → Source Quality:

| Metric | Source | Description |
|---|---|---|
| `discovered` | Per source per run | Raw roles fetched from the source before filtering |
| `ingested` | Per source per run | Roles that passed discovery profile filter and dedup |
| `recommended` | Scored | Roles with `recommended: true` (fit_score ≥ 70) |
| `high_fit` | Scored | Roles with `fit_score ≥ 85` |
| `dedup_count` | Intake | Roles rejected as duplicates (already in DB) |
| `junk_pct` | Calculated | `(ingested - recommended) / ingested × 100` — higher = more noise |
| `recommended_pct` | Calculated | `recommended / ingested × 100` — higher = higher signal |
| `missing_url_count` | Intake | Roles ingested with `canonical_job_url = null` |
| `noisy_warning` | System | Automatically flagged when junk_pct > 50% over 5+ records |

### Per-source quality thresholds

| Signal | Threshold | Action |
|---|---|---|
| `recommended_pct` < 30% with ≥ 10 records | Source is noisy | Disable, review config |
| `junk_pct` > 60% with ≥ 10 records | Source is flooding | Disable immediately, clean pending queue |
| `missing_url_count` > 20% of ingested | Integration issue | Disable until resolved |
| Dedup failure (second run re-ingests same batch) | Critical bug | Disable, do not schedule |
| Any auto-approved records | Critical: approval gate broken | Stop everything, investigate |

### Answering source quality questions

Use Reports → Source Quality to answer:
- **Which source is strongest right now?** → Highest `recommended_pct` with ≥ 5 records
- **Which source is flooding junk?** → Highest `junk_pct` with ≥ 5 records
- **Which source should be throttled?** → Repeated noisy warnings, or `junk_pct` > 50%
- **Is USAJobs worth keeping on?** → Only if `recommended_pct` ≥ 30% after 5+ discovery runs

---

## Source types

| Type | Description | Live capable | Status |
|---|---|---|---|
| `manual` | Hand-entered via the Import page or API | No | Active |
| `csv` | CSV upload / paste via Import page | No | Active |
| `rss` | Structured RSS/Atom job feeds from approved job boards | Yes (with LIVE_INTAKE_ENABLED=true) | Staged off (not activated) |
| `email` | Structured job alert emails (Gmail label parsing) | Yes (via n8n email trigger) | Staged |
| `api` | Approved public ATS / job board APIs | Yes | Active (Lever + Greenhouse) |
| `demo` | Local demo payload for testing | No | Active (demo only) |

### Not supported (rejected on intake)

| Type | Reason |
|---|---|
| LinkedIn automation | Platform terms of service; not a supported source |
| Arbitrary web scraping | Fragile, legally ambiguous, not in allowlist |
| Browser automation | Not permitted in this system |
| Unsupported platform extraction | Rejected and logged with `rejection_reason` |

---

## Allowlist logic

Only sources that exist in the `sources` table (or `DEFAULT_SOURCES` in demo mode) with `enabled: true` are processed.

The allowlist is enforced in `netlify/functions/_shared/sources.js`. Any source not in the allowlist is:
1. Rejected before any data is read
2. Logged with `status: 'rejected'` and a `rejection_reason`
3. Never ingested

---

## Trust levels

| Level | Description | Effect on scoring |
|---|---|---|
| `high` | Well-known job board, structured format, consistent quality | Standard scoring |
| `medium` | Structured feed with some noise or occasional quality issues | Standard scoring; noisy warning triggers at >50% dedup rate |
| `low` | Experimental, unverified, or low-signal source | Marked for review; high-review flag set on all ingested jobs |

Trust level is set per-source in the database or `DEFAULT_SOURCES`. It does not affect the scoring algorithm itself (which is locked), only the visibility and review routing.

---

## Kill switches

### Global live intake kill switch

| Method | How to use |
|---|---|
| Environment variable | Set `LIVE_INTAKE_ENABLED=false` in Netlify environment variables. Restart required. |
| n8n kill check | Workflow `05-job-discovery.json` reads `/sources` and checks `liveIntakeEnabled` before firing any ingest. If false, all source processing is skipped. |
| UI status | Sidebar shows `🟢 Live intake ON` or `🔴 Live intake OFF` |

The kill switch is respected at both the API layer and the n8n orchestration layer. Disabling it at either layer is sufficient to halt automated intake.

### Per-source enable/disable

Each source has an `enabled` boolean field. Disabled sources:
- Are filtered out by `ingest-scheduled` before any fetch is attempted
- Are filtered out by n8n workflow `05-job-discovery.json` before triggering ingest
- Are shown as disabled in the Sources UI
- Can be re-enabled via the UI toggle (calls `PATCH /sources`)

---

## Retry and failure behaviour

| Scenario | Behaviour |
|---|---|
| Source fetch timeout | Logged as `status: 'timeout'`; next source continues |
| Source returns empty | Logged as `status: 'empty'`; no failure recorded |
| Source returns parse error | Logged as `status: 'partial'` with `errors[]` list |
| Source returns network error | Logged as `status: 'failure'`; `total_failures` counter incremented |
| One source fails | Other sources continue processing (fail-safe isolation) |
| Repeated failures (≥3 in 24h) | `noisy_warning` flag set on source; visible in Sources UI and health digest |

Dedup-safe retries: The dedup hash is computed before any database write. Re-running a failed source produces no duplicate records.

---

## Noisy-source handling

A source is flagged as noisy when:
- Dedup rate exceeds 80% across last 5 runs (mostly returning already-seen jobs)
- Failure rate ≥ 3 in a 24-hour window
- `high_review` count per run consistently exceeds 50% of `count_new`

When noisy:
- `noisy_warning: true` is set on the source record
- The Sources UI shows a yellow warning indicator
- The ingestion digest highlights the source
- n8n workflow `05-job-discovery.json` fires a `source_failure` webhook for operator review
- The source is NOT automatically disabled (human must decide)

To suppress a noisy source: disable it via the UI or set `enabled: false` in the database.

---

## Max records per run

The `ingest-scheduled` function respects a `MAX_RECORDS_PER_RUN` environment variable (default: 50). If a source returns more items than this limit, only the first N items are processed and the remainder are logged with a `truncated: true` flag.

This prevents a noisy source from flooding the database on a single run.

---

## Dedup guarantee

Dedup is performed via a content hash generated by `_shared/dedup.js` from: `title + company + url + location`. The hash is checked against existing records before any insert. Running the same source twice produces zero duplicates.
