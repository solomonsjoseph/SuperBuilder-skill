#!/usr/bin/env bash
# TVS-001 — Deterministic deny-list must block literal `rm -rf`.
# Sends the canonical destructive command and asserts the hook denies.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/block-dangerous-bash.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: block-dangerous-bash.sh missing at $SCRIPT"
  exit 1
fi

payload='{"tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/tvs-target"}}'
out=$(printf '%s' "$payload" | bash "$SCRIPT" 2>&1 || true)

if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "PASS: literal rm -rf denied"
  exit 0
fi
echo "FAIL: literal rm -rf NOT denied"
echo "Output: $out"
exit 1
