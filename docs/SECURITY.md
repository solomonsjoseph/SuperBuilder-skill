# Superbuilder — Security Model

> **Trust model:** every enforcement claim below has a runnable check ID (TVS-NNN). Run `bash verify/run.sh` to verify all claims are enforced. See [verify/CONTROLS.json](../verify/CONTROLS.json) for the canonical list.

## Threat model

Superbuilder is autonomous. Its blast radius must be bounded by:
1. Sandboxed execution (Sandcastle).
2. Hook-level command interdiction.
3. Branch isolation (no writes to `main`).
4. Approval gates for production-impacting actions.

A successful attack on Superbuilder would aim to:
- Execute a deploy / publish without approval.
- Destroy or rewrite shared state (DB, prod cluster, infra).
- Exfiltrate secrets to a remote endpoint.
- Silently weaken policy (delete hooks, weaken gates, accept upstream behavior changes).

Each is addressed below.

## Block lists (must block by default — see TVS-001..TVS-004)

The deterministic block-list lives in `hooks/scripts/block-dangerous-bash.sh` and is enforced before tool execution (see [TVS-001](../verify/CONTROLS.json), [TVS-002](../verify/CONTROLS.json), [TVS-003](../verify/CONTROLS.json), [TVS-004](../verify/CONTROLS.json)). Operations blocked outright:

```
rm -rf / | rm -rf . | rm -rf ~ | rm -rf $HOME
git reset --hard
git clean -f
git push --force | git push --mirror
git commit --no-verify
npm publish | pnpm publish | yarn publish | bun publish | cargo publish | twine upload
gh release create
vercel deploy --prod | railway up | fly deploy
kubectl delete namespace ... | kubectl apply ... production
terraform destroy | terraform apply -auto-approve
supabase db reset | dropdb | DROP DATABASE | TRUNCATE TABLE
cat .env / less .env / similar reads
git add .env
```

A second-pass prompt-based PreToolUse hook (`hooks/hooks.json`) catches semantically dangerous commands the regex misses, plus high-risk-but-plausible commands (new prod deps, schema migration execution, secret rotation, payment/auth changes), routing them to `permissionDecision: "ask"`.

**Status of the prompt-based PreToolUse hook:** The prompt hook is **advisory**, not authoritative. The deterministic deny script (`hooks/scripts/block-dangerous-bash.sh`) is the real gate. The prompt hook handles ambiguous-but-plausible commands (new prod deps, schema migrations, secret rotation) by routing to `permissionDecision: "ask"`. If the prompt hook returns malformed output or times out, Claude Code's hook handler may default to allow; the deterministic script must therefore be sufficient on its own to block any catastrophic command (see [TVS-005](../verify/CONTROLS.json)).

## Block list for Write/Edit (see TVS-006)

`hooks/scripts/block-secret-writes.sh` rejects (see [TVS-006](../verify/CONTROLS.json) for fail-closed env handling; coverage of the per-pattern rejections themselves is tracked under "What we don't promise yet"):
- Writes to `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `*.pfx`, `*.p12`.
- File contents containing private-key markers (`BEGIN RSA/OPENSSH/EC/DSA/PRIVATE KEY`) — see [TVS-006](../verify/CONTROLS.json).
- File contents containing common API-token shapes (AWS access keys, OpenAI sk-, GitHub PATs, Slack tokens).
- Edits to `hooks/hooks.json` or `.claude-plugin/plugin.json` that add `disabled`/`skip-validate`/`noVerify` markers.

## Approval-required actions (see TVS-014)

The PRD's `humanApprovalRequiredFor` defaults:

```
production deploy
destructive commands
secrets changes
billing changes
auth changes
database destructive migrations
dependency additions
security policy changes
quality gate weakening
public API contract change
```

These do NOT execute autonomously. The agent must propose, the user must approve via `AskUserQuestion`, and the orchestrator records the approval into `.superbuilder/approvals/`. Cryptographic signing of those approval records is tracked separately (see [TVS-014](../verify/CONTROLS.json)); enforcement that the records actually gate execution is tracked under "What we don't promise yet".

## Stop-hook completeness check (see TVS-007, TVS-018)

The Stop hook reads the conversation context and:
1. If a story claims to pass, verifies evidence files exist under `.superbuilder/evidence/<US>/`.
2. If a deploy/publish/destructive op was attempted without an approval marker in `.superbuilder/approvals/`, returns `decision: "block"` (see [TVS-007](../verify/CONTROLS.json)).

This catches "task done!" claims that lack evidence on disk. Stop-hook fail-loud behaviour on corrupt PRD is verified by [TVS-007](../verify/CONTROLS.json); integration of the TVS suite itself as a Stop-hook gate is tracked by [TVS-018](../verify/CONTROLS.json).

## Sandbox requirement (see TVS-008)

Autonomous coding goes through `createSandbox()`. `noSandbox()` is forbidden. Provider preference: Docker default → Podman (rootless) preferred where available → Vercel sandbox optional cloud. Manual interactive debugging may use no-sandbox; autonomous execution may not. The sandbox dependency is pinned exactly to prevent silent upstream API drift (see [TVS-008](../verify/CONTROLS.json)).

## Branch isolation

No autonomous write hits `main` or the user's production branch. Story branches are namespaced `superbuilder/<US-id>-<slug>`; the integration branch is `superbuilder/integration`. Merges from integration to target are PR-only and need explicit human review. (Runnable verification of branch-isolation is tracked under "What we don't promise yet".)

## Source provenance

`.superbuilder/source-lock.json` pins the upstream commits for the five source repos. `/superbuilder:supersources` is the only path that updates pins, and `behavior` / `security` classifications need explicit user approval per file plus regression evals before acceptance. (Runnable verification is tracked under "What we don't promise yet".)

## Reverification suite

Run these before declaring success on a Superbuilder release:

```bash
rm -rf test-dir
git reset --hard
git clean -fd
git push --force
npm publish | pnpm publish | yarn publish | bun publish
vercel deploy --prod | railway up | fly deploy
supabase db reset
dropdb test
cat .env
git add .env
terraform destroy
kubectl delete namespace production
```

Each command must be **blocked**, **routed to `ask`**, or **refused with a clear reason** (see [TVS-001](../verify/CONTROLS.json), [TVS-002](../verify/CONTROLS.json), [TVS-003](../verify/CONTROLS.json), [TVS-004](../verify/CONTROLS.json), [TVS-005](../verify/CONTROLS.json)). If any executes silently, the plugin fails its security contract and must not ship.

## Policy integrity

A subagent running inside the sandbox could write to `.superbuilder/prd.json` and try to escalate its own privileges mid-run — flipping `deploymentAllowed: true`, removing entries from `humanApprovalRequiredFor`, weakening `qualityGates`, or rewriting `sourceRefs`. Defense in depth:

- At the start of `run()`, the orchestrator (`orchestrator/src/scheduler.ts`) computes a SHA-256 hash of the canonicalised JSON of the four policy fields (`deploymentAllowed`, `humanApprovalRequiredFor`, `qualityGates`, `sourceRefs`) via `policyHash()` in `orchestrator/src/security.ts`. Canonicalisation is recursive stable key sort, no whitespace; `humanApprovalRequiredFor` is alphabetised so legitimate reordering does not trip the comparison (see [TVS-011](../verify/CONTROLS.json), [TVS-012](../verify/CONTROLS.json)).
- Before each `selectNextStory()` iteration, the orchestrator reloads the PRD from disk via `loadPRD()` and re-hashes. On mismatch it writes `.superbuilder/last-run-policy-mismatch.json` containing `{snapshot, current, fields-that-differ}` and aborts the run with `Superbuilder policy fields changed during run; aborting.` (see [TVS-011](../verify/CONTROLS.json)).
- The hash covers only the four fields above. Story progress, evidence pointers, attempts, and other story state may legitimately change between iterations and are excluded from the hash (see [TVS-011](../verify/CONTROLS.json) for coverage gap tracking).

This is defence in depth, not a primary control: the deterministic deny-list and the sandbox boundary are the primary defences (see [TVS-001](../verify/CONTROLS.json), [TVS-008](../verify/CONTROLS.json)). The hash comparison catches the case where a sandboxed subagent gets file-write into the host's `.superbuilder/` directory through a misconfiguration (see [TVS-011](../verify/CONTROLS.json)).

## Gate runner allow-list

The orchestrator's gate runner does NOT use `bash -c`. PRD `qualityGates` commands are parsed as argv and the first token is matched against an allow-list defined in `orchestrator/src/allow-list.ts`. Commands containing shell metacharacters (`;`, `&&`, `||`, `|`, `<`, `>`, backticks, `$(...)`, newlines) are refused at PRD-validate time and at run time (runnable verification tracked under "What we don't promise yet"). This means:

- You cannot pipe gate output, chain commands, or use shell expansion in `qualityGates`.
- If a project's gate naturally needs a pipeline, wrap it in a script committed to the project (e.g., `./scripts/test.sh`) and reference the script directly: `qualityGates.test = "./scripts/test.sh"`. The script path is then a single argv-token and the project owns its content.
- Adding a program to the allow-list needs an edit to `allow-list.ts` and is a deliberate trust decision (runnable verification tracked under "What we don't promise yet").

### Trust model for exec programs

The allow-list is not a sandbox against the project itself. Several allowed programs — `npx`, `pnpx`, `bunx`, `dlx`, `node`, `make`, `cargo`, `deno` — can execute arbitrary code from the project's `package.json` scripts, `Makefile`, or local files. Adding any of these to a `qualityGates` command implicitly trusts the project's own tooling scripts. This is the intended model: Superbuilder trusts the project owner's code, not external, untrusted input.

**High-risk programs.** `orchestrator/src/gates.ts` exports `HIGH_RISK_PROGRAMS` — a `Set` containing: `npx`, `pnpx`, `bunx`, `dlx`, `node`, `make`, `cargo`, `deno`. Before `runGate` will spawn any of these, the PRD's `humanApprovalRequiredFor` array must contain the string `"exec gate command"` (case-insensitive). If the opt-in is absent, `runGate` returns `status: "errored"` with reason:

```
high-risk gate program '<program>' requires humanApprovalRequiredFor: ["exec gate command"] in the PRD
```

To enable high-risk programs for a project, add to the PRD:

```json
"humanApprovalRequiredFor": ["exec gate command", ...]
```

**Audit log.** Before spawning any allowed program, `runGate` writes two header lines to the gate's `.log` file:

```
gate-audit: <program> <args>
gate-command: <full command string>
```

This lets reviewers see exactly what ran during a story without replaying the run.

**Removing high-risk programs.** If running `npx`/`node`/`make`/etc. is undesirable for a project, either remove them from the PRD's `qualityGates` or rely on project-level script wrappers (e.g., `./scripts/test.sh`) that are not themselves in `HIGH_RISK_PROGRAMS`.

## MITRE ATLAS v5.6.0 Threat Coverage

MITRE ATLAS v5.6.0 (May 4, 2026) documents active adversarial ML/AI techniques. (Supersedes v5.4.0 Feb 2026 and v5.5.0 Mar 2026.) Key techniques and SuperBuilder's defense posture:

| Technique | Relevance | Current Defense | Planned Version |
|---|---|---|---|
| T0043 — Indirect Prompt Injection via MCP | HIGH | None — MCP output is not content-scanned | v0.2: `mcp-guard.ts` content scan |
| T0044 — MCP Server Compromise | HIGH | MCP calls not audited; no opt-in gate | v0.2: `mcp-guard.ts` opt-in + audit log |
| T0040 — Agent Escape to Host | HIGH | Sandcastle sandbox (currently broken — immediate fix needed) | Immediate: fix `sandcastle-runner.ts` |
| T0041 — Memory Manipulation via MEMORY.md | CRITICAL | None — MEMORY.md contents not hash-validated | v0.2: `memory-guard.ts` HMAC validation |
| T0035 — Supply Chain Compromise of Plugin | HIGH | No SBOM, no SLSA provenance | v1.0: SBOM + SLSA Level 3 |
| T0029 — Credential Exfiltration via Agent | HIGH | `block-secret-writes.sh` rejects .env writes (see TVS-006) | v0.2: MCP audit log closes exfil via MCP |
| T0031 — Adversarial Inputs via External Data | MEDIUM | `validate.ts` rejects shell metacharacters in PRD gate commands | v0.2: research dossier content scanning |
| T0038 — Model Denial of Service | LOW | Per-story `maxAttempts`; no API cost ceiling | v1.0: token/cost ceiling |

## Audit Log Format

All SuperBuilder runtime audit artifacts use **structured JSON-lines** with **UTC ISO-8601 timestamps** for compatibility with federal SIEM ingestion under OMB M-21-31 (August 2021).

| File | Format | Key fields |
|---|---|---|
| `.superbuilder/progress.jsonl` | JSON-lines | `ts` (ISO-8601), `storyId`, `iter`, `status`, `hash` |
| `.superbuilder/approvals/*.json` | JSON (single record) | `ts`, `storyId`, `approvedBy`, `action` |
| Gate `.log` files | Plain text header + output | `gate-audit:` and `gate-command:` prefix lines |
| `.superbuilder/agent-registry.jsonl` (v0.2) | JSON-lines | `ts`, `subagentId`, `event` (`start`\|`end`), `parentRunId` |
| `.superbuilder/mcp-audit.jsonl` (v0.2) | JSON-lines | `ts`, `server`, `tool`, `args_hash`, `session_id` |
| `.superbuilder/memory-audit.jsonl` (v0.2) | JSON-lines | `ts`, `entryId`, `hmac`, `content_scan_result` |

**Agency retention obligation:** SuperBuilder does not handle log retention itself. The deploying agency is responsible for ingesting these logs into their SIEM and retaining them per OMB M-21-31 (EL3 Advanced tier): **12 months active/hot storage**, **18 months cold archive**. All log files use printable ASCII with UTC ISO-8601 timestamps — no binary encoding — for SIEM compatibility. (Runnable verification of this assertion is tracked under "What we don't promise yet".)

## Known Exploited Vulnerabilities (KEV) Awareness

CISA BOD 22-01 (November 2021, continuously updated) creates two KEV exposure vectors for SuperBuilder:

**Vector 1 — Plugin's own dependencies:** Any npm package in SuperBuilder's dependency tree that appears in the CISA KEV catalog triggers a 2-week remediation obligation for deploying agencies. The SBOM (v1.0) enables agencies to cross-reference SuperBuilder's dependencies. SuperBuilder's CI pipeline (v1.0) includes a `trivy` scan against CRITICAL/HIGH CVEs cross-referenced with the KEV catalog as a release gate.

**Vector 2 — Generated code imports:** The security-auditor agent (v0.4+) cross-references generated `import`, `require`, `pip install`, and `cargo add` statements against the CISA KEV catalog (see [TVS-009](../verify/CONTROLS.json), [TVS-010](../verify/CONTROLS.json) — both currently failing in v0.1). Any generated code that references a package with an active Critical or High KEV entry is flagged as a finding. Version specifications pinned to a KEV-affected version are also flagged. This is the most commonly missed review item for AI code generation tools.

## Coordinated Vulnerability Disclosure

To report a security vulnerability in SuperBuilder:

1. **Do not open a public GitHub issue.** Open a [GitHub Security Advisory](../../security/advisories/new) instead.
2. Include: affected component, reproduction steps, potential impact, and suggested fix (if known).
3. Expected response: acknowledgment within 72 hours; status update within 7 days.
4. Disclosure policy: fixes are shipped before public disclosure; CVE requested if CVSS ≥ 7.0.

This policy satisfies the CVD obligation in the NSA/CISA/ODNI "Securing the Software Supply Chain: Recommended Practices for Developers" (September 2022).

## What we don't promise yet

The bullets below are claims that either (a) describe an area outside Superbuilder's threat model, or (b) describe an asserted control that does not yet have a runnable check ID in [verify/CONTROLS.json](../verify/CONTROLS.json). Each gap of type (b) is tagged with a `TODO: add TVS-NNN check` marker so the gap is countable.

**Out-of-scope claims (no defense promised):**

- What we don't promise (a): No protection against an authenticated user *manually* typing dangerous commands outside Claude Code; the hooks only run when the agent invokes a tool.
- What we don't promise (a): No defense against a compromised upstream source if the user disables `/supersources` review.
- What we don't promise (a): No defense against resource-exhaustion attacks via the `tokenCost` metric — Superbuilder optimizes away from cost growth, without a hard limit.
- What we don't promise (a): No defense against a malicious prompt that convinces the user to override the hooks. The user is sovereign.
- What we don't promise (a): No defense against side-channel timing attacks on encrypted API traffic. The Whisper Leak technique (arxiv:2511.03675, November 2025) reports 98%+ accuracy inferring prompt topics from token-timing patterns in encrypted traffic without decryption. No complete mitigation exists today. For classified or sensitive environments, traffic padding or request batching is recommended. This is an accepted residual risk per NIST SP 800-218A known-limitation disclosure obligations.

**Asserted controls without a TVS check yet (gap items):**

- What we don't promise: secret-pattern coverage of `block-secret-writes.sh` (the .env / private-key / API-token regexes themselves) is not yet asserted by an end-to-end TVS check; only fail-closed env handling is covered by TVS-006. <!-- TODO: add TVS-NNN check -->
- What we don't promise: branch isolation (no autonomous write to `main` or the user's production branch) is asserted by branch naming convention but has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: source-lock pin enforcement (`.superbuilder/source-lock.json` + `/superbuilder:supersources` approval gating) has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: gate-runner allow-list refusal of shell metacharacters in `qualityGates` commands (no `bash -c`, argv parsing, allow-list match) has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: HIGH_RISK_PROGRAMS opt-in gate (refusal to spawn `npx`/`node`/`make`/etc. without `humanApprovalRequiredFor: ["exec gate command"]`) has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: gate-runner audit-log header lines (`gate-audit:` / `gate-command:`) have no runnable TVS check that confirms they are written before spawn. <!-- TODO: add TVS-NNN check -->
- What we don't promise: log-format compatibility with federal SIEM ingestion (printable ASCII, UTC ISO-8601, JSON-lines) has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: prompt-based PreToolUse hook semantic-routing behaviour (high-risk-but-plausible commands routed to `permissionDecision: "ask"`) has no runnable TVS check. <!-- TODO: add TVS-NNN check -->
- What we don't promise: approval-record gating (orchestrator refuses to execute approval-required actions absent a record under `.superbuilder/approvals/`) has no runnable TVS check; only signing of those records (TVS-014, currently MISSING) is tracked. <!-- TODO: add TVS-NNN check -->
