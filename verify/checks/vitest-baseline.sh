#!/usr/bin/env bash
# TVS-016 — Existing vitest suite must pass (153/154 baseline).
# Runs `npm test` in orchestrator/ if node + a node_modules dir exist;
# otherwise reports a deterministic FAIL with the reason.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ODIR="$ROOT/orchestrator"

if [[ ! -d "$ODIR" ]]; then
  echo "FAIL: orchestrator/ missing"
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node not installed in environment"
  exit 1
fi
if [[ ! -d "$ODIR/node_modules" ]]; then
  echo "FAIL: orchestrator/node_modules missing — run \`npm ci\` first (vitest unrunnable)"
  exit 1
fi

cd "$ODIR"
out=$(npm test --silent 2>&1)
rc=$?
if [[ $rc -eq 0 ]]; then
  echo "PASS: vitest suite green"
  exit 0
fi
# Tail the failing summary line if present.
echo "FAIL: vitest suite failed (rc=$rc)"
echo "$out" | tail -20
exit 1
