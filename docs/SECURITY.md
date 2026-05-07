# Superbuilder — Security Model

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

## Block lists (must block by default)

The deterministic block-list lives in `hooks/scripts/block-dangerous-bash.sh` and is enforced before tool execution. Operations blocked outright:

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

**Status of the prompt-based PreToolUse hook:** The prompt hook is **advisory**, not authoritative. The deterministic deny script (`hooks/scripts/block-dangerous-bash.sh`) is the real gate. The prompt hook handles ambiguous-but-plausible commands (new prod deps, schema migrations, secret rotation) by routing to `permissionDecision: "ask"`. If the prompt hook returns malformed output or times out, Claude Code's hook handler may default to allow; the deterministic script must therefore be sufficient on its own to block any catastrophic command.

## Block list for Write/Edit

`hooks/scripts/block-secret-writes.sh` rejects:
- Writes to `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `*.pfx`, `*.p12`.
- File contents containing private-key blocks (`BEGIN RSA/OPENSSH/EC/DSA/PRIVATE KEY`).
- File contents containing common API-token shapes (AWS access keys, OpenAI sk-, GitHub PATs, Slack tokens).
- Edits to `hooks/hooks.json` or `.claude-plugin/plugin.json` that add `disabled`/`skip-validate`/`noVerify` markers.

## Approval-required actions

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

These do NOT execute autonomously. The agent must propose, the user must approve via `AskUserQuestion`, and the orchestrator records the approval into `.superbuilder/approvals/`.

## Stop-hook completeness check

The Stop hook reads the conversation context and:
1. If a story claims to pass, verifies evidence files exist under `.superbuilder/evidence/<US>/`.
2. If a deploy/publish/destructive op was attempted without an approval marker in `.superbuilder/approvals/`, returns `decision: "block"`.

This catches "task done!" claims that lack evidence on disk.

## Sandbox requirement

Autonomous coding goes through `createSandbox()`. `noSandbox()` is forbidden. Provider preference: Docker default → Podman (rootless) preferred where available → Vercel sandbox optional cloud. Manual interactive debugging may use no-sandbox; autonomous execution may not.

## Branch isolation

No autonomous write hits `main` or the user's production branch. Story branches are namespaced `superbuilder/<US-id>-<slug>`; the integration branch is `superbuilder/integration`. Merges from integration to target are PR-only and require explicit human review.

## Source provenance

`.superbuilder/source-lock.json` pins the upstream commits for the five source repos. `/superbuilder:supersources` is the only path that updates pins, and `behavior` / `security` classifications require explicit user approval per file plus regression evals before acceptance.

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

Each command must be **blocked**, **routed to `ask`**, or **refused with a clear reason**. If any executes silently, the plugin fails its security contract and must not ship.

## Policy integrity

A subagent running inside the sandbox could write to `.superbuilder/prd.json` and try to escalate its own privileges mid-run — flipping `deploymentAllowed: true`, removing entries from `humanApprovalRequiredFor`, weakening `qualityGates`, or rewriting `sourceRefs`. Defense in depth:

- At the start of `run()`, the orchestrator (`orchestrator/src/scheduler.ts`) computes a SHA-256 hash of the canonicalised JSON of the four policy fields (`deploymentAllowed`, `humanApprovalRequiredFor`, `qualityGates`, `sourceRefs`) via `policyHash()` in `orchestrator/src/security.ts`. Canonicalisation is recursive stable key sort, no whitespace; `humanApprovalRequiredFor` is alphabetised so legitimate reordering does not trip the check.
- Before each `selectNextStory()` iteration, the orchestrator reloads the PRD from disk via `loadPRD()` and re-hashes. On mismatch it writes `.superbuilder/last-run-policy-mismatch.json` containing `{snapshot, current, fields-that-differ}` and aborts the run with `Superbuilder policy fields changed during run; aborting.`
- The check covers only the four fields above. Story progress, evidence pointers, attempts, and other story state may legitimately change between iterations and are excluded from the hash.

This is defence in depth, not a primary control: the deterministic block-list and the sandbox boundary are the primary defences. The hash check catches the case where a sandboxed subagent gets file-write into the host's `.superbuilder/` directory through a misconfiguration.

## Gate runner allow-list

The orchestrator's gate runner does NOT use `bash -c`. PRD `qualityGates` commands are parsed as argv and the first token is checked against an allow-list defined in `orchestrator/src/allow-list.ts`. Commands containing shell metacharacters (`;`, `&&`, `||`, `|`, `<`, `>`, backticks, `$(...)`, newlines) are refused at PRD-validate time and at run time. This means:

- You cannot pipe gate output, chain commands, or use shell expansion in `qualityGates`.
- If a project's gate naturally needs a pipeline, wrap it in a script committed to the project (e.g., `./scripts/test.sh`) and reference the script directly: `qualityGates.test = "./scripts/test.sh"`. The script path is then a single argv-token and the project owns its content.
- Adding a program to the allow-list requires editing `allow-list.ts` and is a deliberate trust decision.

## What we explicitly do NOT promise

- No protection against an authenticated user *manually* typing dangerous commands outside Claude Code; the hooks only run when the agent invokes a tool.
- No defense against a compromised upstream source if the user disables `/supersources` review.
- No prevention of resource exhaustion attacks via the `tokenCost` metric — Superbuilder optimizes away from cost growth, but does not enforce hard limits.
- No defense against a malicious prompt that convinces the user to override the hooks. The user is sovereign.
