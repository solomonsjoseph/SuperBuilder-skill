#!/usr/bin/env bash
# TVS-010 — SLSA L3+ provenance attestation must be present.
# RESIDUAL: full SLSA L3 verification requires a builder-issued signed
# attestation (in-toto / cosign) and is performed in CI; here we do a
# presence check for the attestation artifact in the repo or known paths.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

for f in \
  "$ROOT/provenance.intoto.jsonl" \
  "$ROOT/.slsa/provenance.json" \
  "$ROOT/attestations/provenance.intoto.jsonl" \
  "$ROOT/dist/provenance.intoto.jsonl"; do
  if [[ -f "$f" ]]; then
    echo "PASS: SLSA provenance attestation present at $f"
    exit 0
  fi
done
echo "FAIL: no SLSA provenance attestation found (looked in provenance.intoto.jsonl, .slsa/, attestations/, dist/)"
exit 1
