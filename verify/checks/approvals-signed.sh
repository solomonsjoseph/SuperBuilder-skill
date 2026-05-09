#!/usr/bin/env bash
# TVS-014 — Approval records must be cryptographically signed (JWS / detached
# sig / minisign), not plain markdown. Plain JSON/MD is forgeable.
# RESIDUAL: signature verification (cosign, minisign, gpg --verify) lives in
# #24. Here we check that approval files carry a signature envelope.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
adir="$ROOT/.superbuilder/approvals"

if [[ ! -d "$adir" ]]; then
  echo "FAIL: no approvals directory at $adir — no signed records possible"
  exit 1
fi

shopt -s nullglob
files=("$adir"/policy-change-*.md "$adir"/policy-change-*.json "$adir"/policy-change-*.jws)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "FAIL: no approval records present in $adir"
  exit 1
fi

unsigned=0
signed=0
for f in "${files[@]}"; do
  # Accept: detached .sig file, .jws extension, or PGP/JWS markers inline.
  if [[ -f "${f}.sig" ]] || [[ "$f" == *.jws ]] \
     || grep -E -q 'BEGIN PGP SIGNATURE|"protected":[[:space:]]*"|^eyJ[A-Za-z0-9_-]+\.' "$f" 2>/dev/null; then
    signed=$((signed + 1))
  else
    unsigned=$((unsigned + 1))
  fi
done

if [[ $unsigned -eq 0 && $signed -gt 0 ]]; then
  echo "PASS: all $signed approval record(s) are signed"
  exit 0
fi
echo "FAIL: $unsigned unsigned approval record(s) found ($signed signed)"
exit 1
