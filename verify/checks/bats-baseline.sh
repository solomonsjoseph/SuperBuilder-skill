#!/usr/bin/env bash
# TVS-017 — Existing bats suite must pass (60/60 baseline).
# Discovers tests under hooks/tests/*.bats and runs bats. If bats is not
# installed, that's a deterministic FAIL (the suite is unrunnable).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TDIR="$ROOT/hooks/tests"

if [[ ! -d "$TDIR" ]]; then
  echo "FAIL: hooks/tests/ missing"
  exit 1
fi
if ! command -v bats >/dev/null 2>&1; then
  echo "FAIL: bats not installed in environment — bats suite unrunnable"
  exit 1
fi

shopt -s nullglob
files=("$TDIR"/*.bats)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "FAIL: no .bats files found under $TDIR"
  exit 1
fi

out=$(bats "${files[@]}" 2>&1)
rc=$?
if [[ $rc -eq 0 ]]; then
  echo "PASS: bats suite green (${#files[@]} file(s))"
  exit 0
fi
echo "FAIL: bats suite failed (rc=$rc)"
echo "$out" | tail -20
exit 1
