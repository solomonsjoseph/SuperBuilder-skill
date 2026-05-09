#!/usr/bin/env bash
# TVS-018 — TVS suite must be wired into the Stop hook so every session
# enforces continuous verification (NIST SP 800-218A RV.3.4).
# Looks for a Stop hook entry that invokes verify/run.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HJ="$ROOT/hooks/hooks.json"

if [[ ! -f "$HJ" ]]; then
  echo "FAIL: hooks/hooks.json missing"
  exit 1
fi

# Walk Stop hooks looking for any command that references verify/run.sh.
match=$(jq -r '
  (.hooks.Stop // [])
  | map(.hooks // [])
  | flatten
  | map(select(.command != null and (.command | tostring | test("verify/run\\.sh"))))
  | length
' "$HJ" 2>/dev/null || echo 0)

if [[ "${match:-0}" -ge 1 ]]; then
  echo "PASS: Stop hook invokes verify/run.sh ($match entry)"
  exit 0
fi
echo "FAIL: Stop hook does NOT invoke verify/run.sh — TVS not enforced as gate"
exit 1
