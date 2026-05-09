# Superbuilder — NIST IR 8397 Developer Verification Standards

**Document:** NIST IR 8397, "Guidelines on Minimum Standards for Developer Verification of Software"
**Authority:** NIST, developed in consultation with NSA
**Mandate:** EO 14028 §4(e) required NIST to publish these guidelines; they are the operative developer verification standard for federal software supply chain compliance.
**Published:** October 2021 | **URL:** nvlpubs.nist.gov/nistpubs/ir/2021/NIST.IR.8397.pdf

This document maps all 11 minimum standards to SuperBuilder's SDLC. A CIA/NSA reviewer enforcing EO 14028 compliance will check all 11 standards against both the plugin's own development process and the quality of code it generates.

---

## Standard 1: Threat Modeling

**Requirement:** Identify design-level security issues before implementation begins.

**SuperBuilder status: ✅ Done**

`docs/THREAT-MODEL.md` provides full STRIDE analysis covering: 8 protected assets, 4 threat actor classes, 12 threat/mitigation/gap rows, build pipeline threat surface, MITRE ATLAS cross-reference, real-world incident precedents (GTG-1002, Mexico breach), and a mitigation roadmap by version.

---

## Standard 2: Automated Testing

**Requirement:** Automated testing for consistency; minimize reliance on manual effort.

**SuperBuilder status: ✅ Done**

153+ automated tests in `orchestrator/` run in CI on every PR:
- `gates.test.ts` — gate runner behavior, HIGH_RISK_PROGRAMS opt-in enforcement
- `security.test.ts` — policy hash, canonicalize, policyDiff
- `validate.test.ts` — PRD validation, FORBIDDEN_TOKENS refusal, allow-list enforcement
- `approvals.test.ts` — human approval gate
- `gate-defaults.test.ts` — stack-aware default gate detection
- `sandcastle-runner.test.ts` — sandbox adapter

New feature PRs must include tests in the same PR. No test-later deferrals.

---

## Standard 3: Static Code Scanning

**Requirement:** Automated static analysis for top bug classes (injection, memory safety, type errors, etc.).

**SuperBuilder status: ⚠️ Partial**

Current:
- TypeScript strict mode (`tsc --noEmit`) runs in CI — catches type errors, null/undefined bugs
- `eslint` in `ALLOWED_PROGRAMS` — available as a quality gate in generated code PRDs
- `semgrep` in `ALLOWED_PROGRAMS` — available for security-focused static analysis in generated code

Gap (v1.0): No automated SAST tool (`semgrep`) runs on SuperBuilder's own `orchestrator/src/` in CI beyond `tsc`. Add `semgrep --config=auto orchestrator/src/` as a CI step.

---

## Standard 4: Heuristic Tools for Detecting Hardcoded Secrets

**Requirement:** Detect hardcoded secrets, credentials, or API tokens in committed code.

**SuperBuilder status: ✅ Done**

`hooks/scripts/block-secret-writes.sh` detects and blocks before every Write/Edit tool call:
- AWS access key shapes (`AKIA[A-Z0-9]{16}`)
- OpenAI `sk-` prefix tokens
- GitHub PATs (`ghp_`, `ghs_`)
- Slack tokens (`xox[bprs]-`)
- Private key blocks (`BEGIN RSA/OPENSSH/EC/DSA/PRIVATE KEY`)
- Writes to `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `*.pfx`, `*.p12`
- Edits to `hooks/hooks.json` adding `disabled`/`skip-validate`/`noVerify` markers

Gap (v1.0): No pre-commit hook scans SuperBuilder's own developer commits. Add `gitleaks` or `trivy secret` scan to CI.

---

## Standard 5: Use of Built-in Security Checks and Language Protections

**Requirement:** Use language/platform built-in security features rather than rolling custom security primitives.

**SuperBuilder status: ✅ Done**

- **TypeScript strict mode:** enforces type safety, null safety, no implicit any
- **`node:crypto`:** built-in SHA-256 for policy hash (not a third-party crypto library)
- **`JSON.stringify` with explicit rejection:** `canonicalize()` in `security.ts` throws on `undefined` and non-finite numbers — prevents hash collisions from JSON's silent mangling behavior
- **`spawn()` with argv array:** gate execution uses `child_process.spawn(program, args)`, not `bash -c` — prevents shell injection by construction; the OS kernel interprets the arguments, not a shell

---

## Standard 6: Black-Box Test Cases

**Requirement:** Tests that treat the system as a black box, testing inputs and outputs without examining internals.

**SuperBuilder status: ⚠️ Partial**

Current black-box coverage:
- `validate.ts` tests treat the PRD validator as a black box: input a PRD JSON, assert pass/fail + error message
- `gates.test.ts` tests verify gate behavior via spawn results without examining internal logic
- `hooks.test.sh` tests hook scripts against specific bash command inputs

Gap (v1.0): Boundary testing for the full orchestrator CLI (e.g., `superbuilder run` with malformed PRD, oversized fields, injection payloads) is not yet in CI. See Standard 9 (fuzzing) for the related gap.

---

## Standard 7: Code-Based Structural Test Cases

**Requirement:** Tests derived from examining code structure — covering distinct execution paths, branches, and error conditions.

**SuperBuilder status: ⚠️ Partial**

Current structural coverage:
- `gates.test.ts` covers: `FORBIDDEN_TOKENS` rejection, allow-list rejection, `HIGH_RISK_PROGRAMS` block, `HIGH_RISK_PROGRAMS` allow with opt-in, successful gate execution, gate timeout, spawn ENOENT
- `security.test.ts` covers: hash stability, `undefined`/NaN rejection, `policyDiff` detection, field normalization
- `validate.test.ts` covers: valid PRD, each invalid field type, FORBIDDEN_TOKENS in gate commands

Gap (v1.0): Coverage metrics are not enforced as a CI gate. Add `--coverage --coverageThreshold='{"global":{"lines":80}}'` to the CI test run.

---

## Standard 8: Historical Test Cases (Regression Tests)

**Requirement:** Tests that reproduce previously discovered bugs to prevent regressions.

**SuperBuilder status: ⚠️ Partial**

Tracked regressions with corresponding tests:
- PR #18: Trust model gate audit log gap — security-auditor agent not logging before spawn; added to `gates.test.ts`
- PR #19: HIGH_RISK_PROGRAMS gate not propagating `allowedHighRisk` to CLI verbs; added to gates test + CLI integration test
- Set B heal harness: `bin/superbuilder-heal --baseline-set B` exercises `block-dangerous-bash.sh` against the full reverification list in `docs/SECURITY.md`

Gap (v1.0): Regression tests are added per fix but not systematically catalogued. Create `tests/regression/` directory with one test file per tracked issue, named `issue-NNN-<description>.test.ts`.

---

## Standard 9: Fuzzing

**Requirement:** Fuzz the software's external interfaces to discover unexpected input handling.

**SuperBuilder status: ❌ Missing**

No fuzz targets exist.

Required fuzz targets (v1.0):
- `validate.ts` PRD parser — fuzz with malformed JSON, oversized field values, unicode injection payloads, deeply nested objects
- `FORBIDDEN_TOKENS` regex — fuzz with unicode variants (`；` fullwidth semicolon), percent-encoded forms, null bytes, combining characters, RTLO characters
- Gate command argv parser — fuzz with unexpected argument shapes, very long strings, embedded newlines

Implementation: Add `npm run fuzz` target using `fast-check` property-based testing as the first milestone (lighter than coverage-guided fuzzing); add coverage-guided fuzzing (e.g., `jazzer.js`) as a follow-on at v1.0 hardening.

---

## Standard 10: Web Application Scanners

**Requirement:** Dynamic scanning for web application vulnerabilities (if applicable).

**SuperBuilder status: ✅ Not Applicable**

SuperBuilder is a CLI plugin, not a web application. No HTTP endpoints, no web UI.

`axe`, `lighthouse`, and `pa11y` are in `ALLOWED_PROGRAMS` for quality gates on **generated code** — these tools satisfy Standard 10 for any web project SuperBuilder builds on a user's behalf.

---

## Standard 11: Address Included Code (Dependency Scanning)

**Requirement:** Verify all third-party libraries, packages, and services used in the artifact.

**SuperBuilder status: ⚠️ Partial**

Current:
- `trivy` in `ALLOWED_PROGRAMS` — available as a gate command in project PRDs
- `bandit` in `ALLOWED_PROGRAMS` — Python dependency audit
- `semgrep` in `ALLOWED_PROGRAMS` — code analysis including dependency patterns

Gaps:
- **(v0.4)** Security-auditor agent must check generated `import`/`require`/`pip install`/`cargo add` statements against the CISA KEV catalog (see `docs/SECURITY.md` "Known Exploited Vulnerabilities (KEV) Awareness"). Hallucinated packages and KEV-matched versions must be flagged as findings before story completion.
- **(v1.0)** SuperBuilder's own `orchestrator/` dependencies must be scanned in CI: `trivy fs --vuln-type library --severity CRITICAL,HIGH orchestrator/` as a release gate.
- **(v1.0)** SBOM auto-generation (SPDX or CycloneDX format) must be produced per release in `.github/workflows/sbom.yml`.
- **(v1.0)** VEX (Vulnerability Exploitability eXchange) documents must be generated alongside the SBOM to distinguish exploitable from non-exploitable CVEs per NSA/CISA/ODNI developer guidance (September 2022).

---

## Summary Gap Table

| Standard | Status | Gap | Fix Version |
|---|---|---|---|
| 1 — Threat modeling | ✅ Done | — | `docs/THREAT-MODEL.md` complete |
| 2 — Automated testing | ✅ Done | — | 153+ tests, CI |
| 3 — Static scanning | ⚠️ Partial | `semgrep` not in CI for own source | v1.0 |
| 4 — Hardcoded secrets | ✅ Done | Developer pre-commit hook missing | v1.0 (`gitleaks` in CI) |
| 5 — Built-in checks | ✅ Done | — | Working |
| 6 — Black-box tests | ⚠️ Partial | CLI boundary + fuzzing | v1.0 |
| 7 — Structural tests | ⚠️ Partial | No coverage gate in CI | v1.0 |
| 8 — Historical tests | ⚠️ Partial | No systematic regression catalogue | v1.0 |
| 9 — Fuzzing | ❌ Missing | No fuzz targets exist | v1.0 |
| 10 — Web app scanner | ✅ N/A | Not a web application | — |
| 11 — Dependency scanning | ⚠️ Partial | KEV check (v0.4), SBOM + VEX + CI scan (v1.0) | v0.4 + v1.0 |
