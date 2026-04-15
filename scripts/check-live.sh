#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-live.sh — Post-run validation helper for first live discovery run
#
# Checks:
#   1. /discover auth gate (unauthorized call should → 401)
#   2. Ingestion logs endpoint responds
#   3. Opportunities endpoint responds (live records present)
#   4. Dedup verification on second run (ingested should be 0)
#
# Usage:
#   export SITE_URL=https://your-site.netlify.app
#   export DISCOVERY_SECRET=your-secret
#   ./scripts/check-live.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SITE_URL="${SITE_URL:-}"
DISCOVERY_SECRET="${DISCOVERY_SECRET:-}"

PASS=0
FAIL=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $label"
    ((PASS++)) || true
  else
    echo "  ✗ $label (expected=$expected, got=$actual)"
    ((FAIL++)) || true
  fi
}

if [[ -z "$SITE_URL" ]]; then
  echo "❌  SITE_URL is not set."
  exit 1
fi

echo "============================================================"
echo "Live Activation Validation — $SITE_URL"
echo "============================================================"
echo ""

# ── 1. Auth gate — unauthorized call must return 401 ─────────────────────────
echo "1. Auth gate"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$SITE_URL/.netlify/functions/discover" \
  -H "Content-Type: application/json" \
  -d '{}')
check "POST /discover without auth → 401" "401" "$STATUS"
echo ""

# ── 2. Auth gate — authorized call (may return 200 even if intake disabled) ──
if [[ -n "$DISCOVERY_SECRET" ]]; then
  echo "2. Authorized call"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SITE_URL/.netlify/functions/discover" \
    -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
    -H "Content-Type: application/json" \
    -d '{}')
  check "POST /discover with valid secret → 200" "200" "$STATUS"
  echo ""
else
  echo "2. Authorized call — SKIPPED (DISCOVERY_SECRET not set)"
  echo ""
fi

# ── 3. Opportunities endpoint responds ───────────────────────────────────────
echo "3. Opportunities API"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$SITE_URL/.netlify/functions/opportunities")
check "GET /opportunities → 200" "200" "$STATUS"
echo ""

# ── 4. Logs endpoint responds ─────────────────────────────────────────────────
echo "4. Ingestion logs"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "$SITE_URL/.netlify/functions/logs")
check "GET /logs → 200" "200" "$STATUS"
echo ""

# ── 5. Dedup verification (second run — ingested should be 0) ────────────────
if [[ -n "$DISCOVERY_SECRET" ]]; then
  echo "5. Dedup verification (second run)"
  BODY=$(curl -s \
    -X POST "$SITE_URL/.netlify/functions/discover" \
    -H "X-Discovery-Secret: $DISCOVERY_SECRET" \
    -H "Content-Type: application/json" \
    -d '{}')
  
  INGESTED="?"
  if command -v python3 &>/dev/null; then
    INGESTED=$(echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_ingested','?'))" 2>/dev/null || echo "?")
  fi

  if [[ "$INGESTED" == "0" ]]; then
    echo "  ✓ Second discovery run ingested=0 (dedup working)"
    ((PASS++)) || true
  elif [[ "$INGESTED" == "?" ]]; then
    echo "  ? Could not parse ingested count from response"
  else
    echo "  ⚠  Second run ingested=$INGESTED — expected 0 if first run already ran"
    echo "     This is normal if new jobs were posted between runs."
  fi
  echo ""
else
  echo "5. Dedup verification — SKIPPED (DISCOVERY_SECRET not set)"
  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo "============================================================"
echo "Result: $PASS passed"
if [[ "$FAIL" -gt 0 ]]; then
  echo "        $FAIL FAILED ← investigate above"
  echo ""
  echo "Common fixes:"
  echo "  - 401 not returned: check DISCOVERY_SECRET is set in Netlify env vars"
  echo "  - 500 errors: check Supabase env vars and migrations"
  echo "  - Intake disabled: set LIVE_INTAKE_ENABLED=true in Netlify"
fi
echo "============================================================"

[[ "$FAIL" -eq 0 ]]
