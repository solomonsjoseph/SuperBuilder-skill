#!/usr/bin/env bash
# TVS-008 — Sandcastle dependency must be exact-pinned, not caret/tilde.
# Caret pin allowed 0.5.10 to be pulled, breaking the runner (observation 940).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$ROOT/orchestrator/package.json"

ver=$(jq -r '.dependencies["@ai-hero/sandcastle"] // empty' "$PKG")
if [[ -z "$ver" ]]; then
  echo "FAIL: @ai-hero/sandcastle not declared"
  exit 1
fi
case "$ver" in
  ^*|~*|*"||"*|"*"|"")
    echo "FAIL: sandcastle pin '$ver' is not exact — drift can pull broken upstream"
    exit 1
    ;;
  *)
    echo "PASS: sandcastle pinned exactly to $ver"
    exit 0
    ;;
esac
