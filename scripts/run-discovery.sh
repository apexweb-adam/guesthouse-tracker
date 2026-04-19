#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-discovery.sh — Manual discovery trigger for live discovery runs
#
# Usage:
#   ./scripts/run-discovery.sh                          # all enabled live sources
#   ./scripts/run-discovery.sh src-greenhouse-boards    # Greenhouse only (by source ID)
#   ./scripts/run-discovery.sh src-lever-boards         # Lever only (by source ID)
#   ./scripts/run-discovery.sh --family=greenhouse      # all greenhouse sources
#   ./scripts/run-discovery.sh --family=lever           # all lever sources
#   ./scripts/run-discovery.sh --family=usajobs         # USAJobs only (Wave 2)
#   ./scripts/run-discovery.sh --family=rss             # all RSS feeds (Wave 3)
#
# Required env vars (export before running, or set in .env):
#   SITE_URL         e.g. https://your-site.netlify.app
#   DISCOVERY_SECRET the same value set in Netlify env vars
#
# Optional:
#   SOURCE_ID        a source ID to run instead of all sources
#   SOURCE_FAMILY    a source family to filter by (e.g. greenhouse, lever, usajobs, rss)
#
# Example:
#   export SITE_URL=https://candidate-job-search.netlify.app
#   export DISCOVERY_SECRET=abc123...
#   ./scripts/run-discovery.sh                          # all enabled live sources
#   ./scripts/run-discovery.sh src-greenhouse-boards    # Greenhouse only
#   ./scripts/run-discovery.sh src-lever-boards         # Lever only (after LEVER_BOARDS is set)
#   ./scripts/run-discovery.sh --family=usajobs         # USAJobs only (after USAJOBS_API_KEY set)
#   ./scripts/run-discovery.sh --family=rss             # all enabled RSS feeds
#
# Source activation waves:
#   Wave 1 (active): lever, greenhouse
#   Wave 2 (staged): usajobs  — activate only after API key set + manual run approved
#   Wave 3 (staged): rss      — activate only after specific feeds vetted + manual run approved
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SITE_URL="${SITE_URL:-}"
DISCOVERY_SECRET="${DISCOVERY_SECRET:-}"
SOURCE_ID=""
SOURCE_FAMILY=""

# Parse arguments: support both positional source ID and --family=xxx flag
for arg in "$@"; do
  case "$arg" in
    --family=*)
      SOURCE_FAMILY="${arg#--family=}"
      ;;
    --*)
      echo "❌  Unknown flag: $arg"
      echo "    Use: ./scripts/run-discovery.sh [sourceId | --family=familyName]"
      exit 1
      ;;
    *)
      SOURCE_ID="$arg"
      ;;
  esac
done

# Fall back to env var if no positional arg given
if [[ -z "$SOURCE_ID" ]]; then
  SOURCE_ID="${SOURCE_ID:-}"
fi
if [[ -z "$SOURCE_FAMILY" ]]; then
  SOURCE_FAMILY="${SOURCE_FAMILY:-}"
fi

# ── Validate inputs ───────────────────────────────────────────────────────────

if [[ -z "$SITE_URL" ]]; then
  echo "❌  SITE_URL is not set. Export it before running:"
  echo "    export SITE_URL=https://your-site.netlify.app"
  exit 1
fi

if [[ -z "$DISCOVERY_SECRET" ]]; then
  echo "❌  DISCOVERY_SECRET is not set. Export it before running:"
  echo "    export DISCOVERY_SECRET=<your-secret>"
  exit 1
fi

# ── Build payload ─────────────────────────────────────────────────────────────

if [[ -n "$SOURCE_ID" ]]; then
  PAYLOAD="{\"sourceId\":\"$SOURCE_ID\"}"
  echo "▶  Triggering discovery for source: $SOURCE_ID"
elif [[ -n "$SOURCE_FAMILY" ]]; then
  PAYLOAD="{\"sourceFamily\":\"$SOURCE_FAMILY\"}"
  echo "▶  Triggering discovery for source family: $SOURCE_FAMILY"
else
  PAYLOAD="{}"
  echo "▶  Triggering discovery for all enabled live sources"
fi

ENDPOINT="$SITE_URL/.netlify/functions/discover"
echo "   Endpoint: $ENDPOINT"
echo ""

# ── Fire the request ──────────────────────────────────────────────────────────

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP $HTTP_STATUS"
echo ""

# ── Parse result ──────────────────────────────────────────────────────────────

if command -v python3 &>/dev/null; then
  echo "$BODY" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  print('ok         :', d.get('ok', '?'))
  print('mode       :', d.get('mode', '?'))
  print('sources_run:', d.get('sources_run', '?'))
  print('discovered :', d.get('total_discovered', '?'))
  print('ingested   :', d.get('total_ingested', '?'))
  print('recommended:', d.get('total_recommended', '?'))
  results = d.get('results', [])
  if results:
    print()
    print('Per-source results:')
    for r in results:
      status = '✓' if not r.get('error') else '✗'
      print(f\"  {status} {r.get('source_id','?')} — discovered={r.get('discovered',0)} ingested={r.get('ingested',0)} deduped={r.get('deduped',0)} error={r.get('error','')}\")
  msg = d.get('message', '')
  if msg:
    print()
    print('Message:', msg)
  err = d.get('error', '')
  if err:
    print()
    print('Error:', err)
except Exception as e:
  print('(raw response — could not parse JSON)')
  print(sys.stdin.read() if False else '')
" || echo "$BODY"
else
  echo "$BODY"
fi

echo ""

# ── Exit with appropriate code ────────────────────────────────────────────────

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "✅  Request completed with HTTP 200."
  echo ""
  echo "Next steps:"
  echo "  1. Open /tracker in your app — check Approval Queue for new discovered roles"
  echo "  2. Inspect role fit scores and readiness classifications"
  echo "  3. Approve strong TPM/Delivery roles → Generate Apply Pack"
  echo "  4. Run a second time to verify dedup (ingested should be 0 on second run)"
else
  echo "⚠️  Request returned HTTP $HTTP_STATUS — check the response above."
  exit 1
fi
