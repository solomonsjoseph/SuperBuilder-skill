#!/usr/bin/env bash
# TVS-012 — FIPS 140-3 validated crypto module must be in the policy-hash path.
# RESIDUAL: full FIPS 140-3 validation requires a validated module at runtime
# (e.g. OpenSSL FIPS provider, Node built with --openssl-fips, or a marker
# file `.fips-attested` issued by the build pipeline). We check for an
# attestation marker; no marker = FAIL (current v0.1 state — uses Node stdlib
# on a non-FIPS OpenSSL build).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

for f in \
  "$ROOT/.fips-attested" \
  "$ROOT/orchestrator/.fips-attested" \
  "$ROOT/attestations/fips-140-3.json"; do
  if [[ -f "$f" ]]; then
    echo "PASS: FIPS 140-3 attestation marker present at $f"
    exit 0
  fi
done
echo "FAIL: no FIPS 140-3 attestation marker found — Node stdlib crypto on non-FIPS build"
exit 1
