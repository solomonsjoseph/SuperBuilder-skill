#!/usr/bin/env bash
# TVS-003 — Deny-list must resist shell-alias and function-definition bypass.
# Simple/medium/hard payloads from issue #21 (TVS-003).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/block-dangerous-bash.sh"

run_payload() {
  local cmd="$1"
  local payload
  payload=$(jq -nc --arg c "$cmd" '{tool_name:"Bash", tool_input:{command:$c}}')
  printf '%s' "$payload" | bash "$SCRIPT" 2>&1 || true
}

assert_deny() {
  local label="$1" cmd="$2"
  local out
  out=$(run_payload "$cmd")
  if echo "$out" | grep -q '"permissionDecision": "deny"'; then
    echo "PASS [$label]"
    return 0
  else
    echo "FAIL [$label]"
    echo "  payload: $cmd"
    echo "  output : $out"
    return 1
  fi
}

rc=0
assert_deny "simple"  'alias DEL="rm -rf"; DEL /tmp/tvs-target' || rc=1
assert_deny "medium"  "alias D='rm'; alias R='-rf'; D R /tmp/tvs-target" || rc=1
assert_deny "hard"    'function D() { rm -rf "$@"; }; D /tmp/tvs-target' || rc=1

if [[ $rc -eq 0 ]]; then
  echo "PASS: shell-alias bypass denied (simple+medium+hard)"
  exit 0
else
  echo "FAIL: at least one alias-bypass payload was not denied"
  exit 1
fi
