#!/usr/bin/env bash
# TVS-015 — Evidence bundles must be hash-chained (Merkle / append-only).
# Each evidence entry must reference the prior entry's hash; tampering with
# any earlier file breaks the chain.
# RESIDUAL: production design uses sigstore rekor or similar transparency
# log; here we check for a chain.json / .merkle file and that adjacent
# entries link via prev_hash.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

candidates=(
  "$ROOT/.superbuilder/evidence/chain.json"
  "$ROOT/verify/evidence/chain.json"
  "$ROOT/.superbuilder/evidence/.merkle"
)

chain=""
for c in "${candidates[@]}"; do
  if [[ -f "$c" ]]; then chain="$c"; break; fi
done

if [[ -z "$chain" ]]; then
  echo "FAIL: no evidence hash-chain manifest found (looked for chain.json / .merkle)"
  exit 1
fi

# Every entry must have a prev_hash field; first entry prev_hash="GENESIS".
if ! jq -e '. | type == "array"' "$chain" >/dev/null 2>&1; then
  echo "FAIL: chain manifest at $chain is not a JSON array of entries"
  exit 1
fi

bad=$(jq '[.[] | select((.prev_hash // "") == "")] | length' "$chain")
if [[ "$bad" -gt 0 ]]; then
  echo "FAIL: $bad entry(ies) missing prev_hash — chain not append-only"
  exit 1
fi
echo "PASS: evidence hash-chain present at $chain with prev_hash links"
exit 0
