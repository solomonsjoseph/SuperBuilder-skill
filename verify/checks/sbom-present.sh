#!/usr/bin/env bash
# TVS-009 — SBOM artifact must be present and current.
# Required by EO 14028 §4(e)(vii) and NTIA Minimum Elements.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

for f in "$ROOT/sbom.json" "$ROOT/sbom.spdx.json" "$ROOT/sbom.cdx.json" \
         "$ROOT/SBOM.json" "$ROOT/.sbom/sbom.json"; do
  if [[ -f "$f" ]]; then
    echo "PASS: SBOM found at $f"
    exit 0
  fi
done
echo "FAIL: no SBOM artifact present (looked for sbom.json, sbom.spdx.json, sbom.cdx.json)"
exit 1
