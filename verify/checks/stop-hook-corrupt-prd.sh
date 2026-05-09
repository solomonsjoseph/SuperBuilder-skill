#!/usr/bin/env bash
# TVS-007 — Stop hook must FAIL LOUD on corrupt prd.json (non-zero exit OR
# emit a block decision — never approve a session sitting on garbage state).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/hooks/scripts/verify-stop.sh"

if [[ ! -f "$SCRIPT" ]]; then
  echo "FAIL: verify-stop.sh missing"
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.superbuilder"
printf 'this is not { valid json' > "$tmp/.superbuilder/prd.json"

set +e
out=$(CLAUDE_PROJECT_DIR="$tmp" bash "$SCRIPT" <<<'{}' 2>&1)
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  echo "PASS: corrupt PRD caused non-zero exit ($rc)"
  exit 0
fi
if echo "$out" | grep -q '"decision":"block"'; then
  echo "PASS: corrupt PRD produced block decision"
  exit 0
fi
echo "FAIL: corrupt PRD silently approved. rc=$rc out=$out"
exit 1
