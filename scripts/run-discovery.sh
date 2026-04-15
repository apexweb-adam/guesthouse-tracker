#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-discovery.sh — Manual discovery trigger for the first live run
#
# Usage:
#   ./scripts/run-discovery.sh
#   ./scripts/run-discovery.sh src-greenhouse-boards    # single source
#
# Required env vars (export before running, or set in .env):
#   SITE_URL         e.g. https://your-site.netlify.app
#   DISCOVERY_SECRET the same value set in Netlify env vars
#
# Optional:
#   SOURCE_ID        a source ID to run instead of all sources
#
# Example:
#   export SITE_URL=https://candidate-job-search.netlify.app
#   export DISCOVERY_SECRET=abc123...
#   ./scripts/run-discovery.sh
#   ./scripts/run-discovery.sh src-greenhouse-boards
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SITE_URL="${SITE_URL:-}"
DISCOVERY_SECRET="${DISCOVERY_SECRET:-}"
SOURCE_ID="${1:-${SOURCE_ID:-}}"

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
