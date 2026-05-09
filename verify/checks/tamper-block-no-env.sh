#!/usr/bin/env bash
# TVS-006 — Tamper-block must FAIL CLOSED when CLAUDE_PLUGIN_ROOT is unset.
# Sends a Write to a path that *would* be inside the plugin (hooks/scripts/X)
# without CLAUDE_PLUGIN_ROOT set; the hook currently falls through (graceful
# fallback) — that's the documented v0.1 gap. We assert deny; fall-through = FAIL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/block-secret-writes.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: block-secret-writes.sh missing"
  exit 1
fi

target="$ROOT/hooks/scripts/tampered-by-tvs.sh"
payload=$(jq -n --arg p "$target" \
  '{tool_name:"Write", tool_input:{file_path:$p, content:"#!/bin/sh\necho tampered\n"}}')

set +e
out=$(env -u CLAUDE_PLUGIN_ROOT bash "$SCRIPT" <<<"$payload" 2>&1)
rc=$?
set -e

if echo "$out" | grep -q '"permissionDecision": "deny"'; then
  echo "PASS: tamper-block fired even with CLAUDE_PLUGIN_ROOT unset"
  exit 0
fi
echo "FAIL: tamper-block fell through (graceful fallback) when env unset — not fail-closed"
echo "rc=$rc out=$out"
exit 1
