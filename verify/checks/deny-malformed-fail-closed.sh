#!/usr/bin/env bash
# TVS-005 — Deny-list must FAIL CLOSED on malformed JSON input.
# Sends garbage on stdin; the hook must either deny or non-zero-exit.
# A clean `exit 0` with no decision = silent allow = FAIL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/block-dangerous-bash.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: block-dangerous-bash.sh missing"
  exit 1
fi

# Garbage payload — not JSON, contains rm -rf inline.
payload='this is not json { rm -rf / } broken'
set +e
out=$(printf '%s' "$payload" | bash "$SCRIPT" 2>&1)
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo "PASS: malformed input caused non-zero exit ($rc) — fail-closed"
  exit 0
fi
if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "PASS: malformed input produced deny decision — fail-closed"
  exit 0
fi
echo "FAIL: malformed input silently allowed (rc=0, no deny). Output: $out"
exit 1
