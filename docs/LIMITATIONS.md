# Superbuilder — Limitations

This is an honest list of things Superbuilder does NOT do, and where the current
implementation is foundation rather than complete.

## Not yet wired (foundation; needs filling)

- **Orchestrator integrations.**
  - `orchestrator/src/sandcastle-runner.ts` is verified against
    `@ai-hero/sandcastle` ^0.5.8 on 2026-05-07; see
    `.superbuilder/source-lock.json`.
  - `heal` and `sources` CLI verbs are stubbed in `orchestrator/src/index.ts`;
    today they're invoked via the slash commands and the corresponding skills,
    not via the CLI verb. Wiring the CLI verbs is a follow-up.
  - **Evidence capture path.** The orchestrator captures commits and diffs in
    two ways: (1) sandcastle's own `SandboxRunResult.commits[].sha` list,
    surfaced through the adapter and recorded in `story.evidence.commits`
    after each run; (2) reading `.superbuilder/evidence/<US>/diff.patch` from
    disk, which the implementer prompt is instructed to write before
    completing. Bind-mount providers (docker, podman) commit on a real host
    git worktree so the story branch is visible to the host repo after
    `sandbox.close()` — this is what enables the ff-only merge into
    `superbuilder/integration`. The deterministic Stop hook
    (`hooks/verify-stop.sh`) reads from disk, so as long as `diff.patch`
    exists and is non-empty the loop completes correctly.

- **Self-heal harness.** The protocol is documented (`skills/10-self-improve`,
  `agents/self-improvement-researcher`, `docs/EVALS.md`) but the `eval-task-set`
  fixture project that Set A/B/C reference does not exist in this repo. Build
  it before claiming `/superbuilder:superheal` produces real measurements.

- **Source-update auditor.** The agent and the audit shape are defined
  (`skills/11-update-sources`, `agents/source-update-auditor`); the GitHub
  fetching path uses `WebFetch` against public URLs, but the rate-limit /
  retry / pagination behavior on large diffs is not hardened.

- **Browser/a11y/perf gates.** The orchestrator runs `qualityGates.browser`,
  `accessibility`, and `performance` if the project provides commands. Out of
  the box no command is provided — the user must populate
  `.superbuilder/context/gates.json` (or `qualityGates` in the PRD) with concrete
  invocations. The skills tell agents to use Chrome DevTools MCP / Playwright
  but the connection is the user's responsibility.

## Out of scope (intentionally)

- **Distributed multi-machine swarms.** Superbuilder runs locally. Cloud
  fan-out beyond one Vercel sandbox per story is not on the roadmap.
- **Auto-deploy.** Production deploy will always require explicit human
  approval. There is no path that bypasses this; that is the design.
- **Editor-side UI.** Status is read via `/superbuilder:superstatus` from the
  CLI; there is no tray app, dashboard, or websocket.
- **Code generation for new languages.** The orchestrator supports any project
  whose package manager is in the detected list; if your project uses
  something exotic (Nix flakes, Bazel, custom Make), wire the gate commands
  manually.

## Known sharp edges

- The Stop hook reads files on disk to confirm evidence; if the agent writes
  evidence to a non-standard path, the hook will block valid completions.
  Stay within `.superbuilder/evidence/<US>/`.
- Hooks load at session start. Editing `hooks/hooks.json` mid-session has no
  effect until you restart Claude Code.
- The block-list regex is conservative. If a legitimate command matches a
  pattern (e.g. `git reset --hard <commit>` in a controlled rebase), you'll
  need to escalate via `AskUserQuestion` and the user will explicitly approve.

## What "done" looks like

Per the spec, Superbuilder is done only when (a) it installs as one Claude Code
plugin, (b) `/superbuilder:superbuild` converts an idea into a PRD, (c) stories
run through Sandcastle, (d) each produces evidence, (e) failed stories are not
marked complete, (f) review/security/test fan-out works, (g) source updates can
be audited, (h) self-healing works through measured experiments, (i) hooks
block dangerous behavior, (j) final output is PR-ready, (k) production deploy
still requires explicit approval.

This release: (a), (b)*, (e), (f) via fan-out, (g) shape only, (h) protocol
only, (i), (j) shape only, (k) yes. Items marked "shape only" need additional
implementation work to be production-grade.
*(b) needs the user to author the PRD interactively; the skills guide it but
the LLM and the user are co-producing it.

This is a foundation, not a turnkey product. The architecture and safety
boundaries are real; the orchestrator wiring needs more iteration.
