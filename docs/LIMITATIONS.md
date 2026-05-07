# Superbuilder — Limitations

This is an honest list of things Superbuilder does NOT do, and where the current
implementation is foundation rather than complete.

## Not yet wired (foundation; needs filling)

- **Orchestrator integrations.**
  - `orchestrator/src/sandcastle-runner.ts` imports `sandcastle` lazily and uses a
    narrow API surface. The actual upstream API must be verified against the
    pinned commit in `.superbuilder/source-lock.json` before relying on autonomous
    runs. If the API has shifted, `createSandbox`/`run` calls need adjusting.
  - `heal` and `sources` CLI verbs are stubbed in `orchestrator/src/index.ts`;
    today they're invoked via the slash commands and the corresponding skills,
    not via the CLI verb. Wiring the CLI verbs is a follow-up.
  - The story merge step (story branch → `superbuilder/integration`) is described
    in `docs/ARCHITECTURE.md` but not yet implemented in `scheduler.ts`.
  - **Evidence capture path.** The orchestrator captures commits/diffs in two
    ways: (1) host-side `git log integration..HEAD` plus `git diff` from the
    project root, which only works when the host process is actually on the
    story branch — true for `dryRun`, but inside a real run the branch lives
    inside Sandcastle and the host HEAD has not moved; (2) reading
    `.superbuilder/evidence/<US>/diff.patch` from disk, which the implementer
    prompt is now instructed to write before completing. Sandcastle's
    branch-sync API needs to be verified against the pinned upstream commit in
    `.superbuilder/source-lock.json` before option (1) can be relied on. The
    deterministic Stop hook (`hooks/verify-stop.sh`) reads from disk, so as
    long as `diff.patch` exists and is non-empty the loop completes correctly.

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
