#!/usr/bin/env bash
# Trust Verification Suite (TVS) runner.
# Reads verify/CONTROLS.json, executes each check, writes per-control evidence
# to verify/evidence/<id>.json, and emits a summary manifest verify/MANIFEST.json
# with SHA-256 over the concatenated evidence (tamper-detectable).
#
# Exit code is non-zero if any control with severity >= "high" fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VDIR="$ROOT/verify"
EDIR="$VDIR/evidence"
mkdir -p "$EDIR"

# Portable SHA-256: prefer shasum (macOS default), fall back to sha256sum (Linux default).
sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$@"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    echo "TVS: no SHA-256 tool found (need shasum or sha256sum)" >&2
    exit 2
  fi
}

CONTROLS="$VDIR/CONTROLS.json"
if [[ ! -f "$CONTROLS" ]]; then
  echo "TVS: CONTROLS.json missing" >&2
  exit 2
fi

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
manifest_lines=()
fail_high=0
total=0
passed=0
failed=0

while IFS= read -r row; do
  total=$((total + 1))
  id=$(echo "$row" | jq -r '.id')
  title=$(echo "$row" | jq -r '.title')
  check=$(echo "$row" | jq -r '.check // empty')
  severity=$(echo "$row" | jq -r '.severity')
  evidence="$EDIR/${id}.json"

  if [[ -z "$check" || ! -f "$VDIR/$check" ]]; then
    status="missing"
    output="check script not implemented"
  else
    chmod +x "$VDIR/$check"
    output=$("$VDIR/$check" 2>&1) && rc=0 || rc=$?
    if [[ $rc -eq 0 ]]; then status="pass"; passed=$((passed + 1));
    else status="fail"; failed=$((failed + 1)); fi
  fi

  if [[ "$status" != "pass" && "$severity" =~ ^(critical|high)$ ]]; then
    fail_high=$((fail_high + 1))
  fi

  jq -n \
    --arg id "$id" --arg title "$title" --arg status "$status" \
    --arg severity "$severity" --arg ts "$ts" --arg output "$output" \
    '{id:$id, title:$title, status:$status, severity:$severity, ts:$ts, output:$output}' \
    > "$evidence"
  manifest_lines+=("$evidence")
  printf '%-10s %-9s %s\n' "$id" "[$status]" "$title"
done < <(jq -c '.controls[]' "$CONTROLS")

# Hash chain over evidence files (sorted by id).
chain=""
for f in $(ls "$EDIR"/TVS-*.json 2>/dev/null | sort); do
  chain="$chain$(sha256 "$f" | awk '{print $1}')"
done
root_hash=$(printf '%s' "$chain" | sha256 | awk '{print $1}')

jq -n \
  --arg ts "$ts" --argjson total "$total" --argjson passed "$passed" \
  --argjson failed "$failed" --argjson fail_high "$fail_high" \
  --arg root_hash "$root_hash" \
  '{ts:$ts, total:$total, passed:$passed, failed:$failed,
    high_or_critical_failures:$fail_high, evidence_root_sha256:$root_hash}' \
  > "$VDIR/MANIFEST.json"

echo
echo "=== TVS Summary ==="
cat "$VDIR/MANIFEST.json"
echo

if [[ $fail_high -gt 0 ]]; then
  echo "TVS: $fail_high high/critical control(s) failing — release blocked." >&2
  exit 1
fi
exit 0
