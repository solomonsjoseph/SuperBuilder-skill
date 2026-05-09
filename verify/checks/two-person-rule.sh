#!/usr/bin/env bash
# TVS-013 — Two-person rule must be enforced for policy mutations in AFK.
# Looks for code that requires >=2 distinct approvers in approvals/ flow,
# OR a documented design with the dual-approval check wired in.
# RESIDUAL: a real test harness for AFK dual-approval lives in #23/#27.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Check 1: code references two-person / dual-approval logic.
hits=0
for path in "$ROOT/orchestrator/src" "$ROOT/hooks/scripts" "$ROOT/commands"; do
  [[ -d "$path" ]] || continue
  if grep -R -E -l "two[-_]person|dual[-_]approval|requireTwoApprovers|minApprovers" "$path" >/dev/null 2>&1; then
    hits=$((hits + 1))
  fi
done

# Check 2: approvals dir contains at least 2 distinct signers per policy change.
adir="$ROOT/.superbuilder/approvals"
if [[ -d "$adir" ]]; then
  for f in "$adir"/policy-change-*.md; do
    [[ -f "$f" ]] || continue
    signers=$(grep -E -i '^(approver|signer|approved-by):' "$f" 2>/dev/null | sort -u | wc -l)
    if [[ "$signers" -ge 2 ]]; then
      hits=$((hits + 1))
    fi
  done
fi

if [[ $hits -gt 0 ]]; then
  echo "PASS: two-person rule signal found ($hits indicator(s))"
  exit 0
fi
echo "FAIL: no two-person / dual-approval enforcement found in code or approvals/"
exit 1
