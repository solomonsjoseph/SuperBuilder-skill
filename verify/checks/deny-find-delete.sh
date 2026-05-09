#!/usr/bin/env bash
# TVS-004 — Deny-list must catch semantically-equivalent destruction (no rm token).
# Empirically failing in v0.1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/block-dangerous-bash.sh"

payload='{"tool_name":"Bash","tool_input":{"command":"find /tmp/tvs-target -delete"}}'
out=$(printf '%s' "$payload" | bash "$SCRIPT" 2>&1 || true)

if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "PASS: find -delete denied"
  exit 0
else
  echo "FAIL: find -delete NOT denied — destruction without 'rm' token bypasses deny-list"
  exit 1
fi
