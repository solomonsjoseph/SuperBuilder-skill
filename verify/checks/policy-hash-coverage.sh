#!/usr/bin/env bash
# TVS-011 — Policy hash must cover ALL trust-boundary fields, not just 4.
# Required fields per design: deploymentAllowed, humanApprovalRequiredFor,
# qualityGates, sourceRefs, allowList, scope, stories.
# Currently security.ts ships with 4 — known PARTIAL state.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/orchestrator/src/security.ts"

if [[ ! -f "$SRC" ]]; then
  echo "FAIL: security.ts missing at $SRC"
  exit 1
fi

required=(deploymentAllowed humanApprovalRequiredFor qualityGates sourceRefs allowList scope stories)
missing=()
for f in "${required[@]}"; do
  if ! grep -E -q "^[[:space:]]*\"$f\"" "$SRC"; then
    missing+=("$f")
  fi
done

if [[ ${#missing[@]} -eq 0 ]]; then
  echo "PASS: policy hash covers all ${#required[@]} trust-boundary fields"
  exit 0
fi
echo "FAIL: policy hash missing fields: ${missing[*]} (found in POLICY_FIELDS list)"
exit 1
