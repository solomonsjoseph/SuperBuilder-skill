---
description: Audit upstream source repos (Addy, Matt, Sandcastle, Ralph, Autoresearch) for changes since the pinned ref. Classify impact, propose update plan, never silently absorb.
allowed-tools: Read, Write, Edit, Bash, Task
---

Source-update audit for Superbuilder.

The data fetch runs through the orchestrator's `sources` CLI verb (which
handles auth, pagination, rate-limit backoff, and large-diff truncation).
The agent reads the resulting markdown report and synthesizes impact.

## Steps

1. Read `.superbuilder/source-lock.json`. If absent, generate one with the refs documented in `docs/SOURCE-MAP.md` and tell the user — that bootstrap counts as the first audit.

2. Run the auditor CLI verb:

   ```bash
   bin/superbuilder-sources --root .superbuilder
   ```

   This calls `orchestrator/src/source-audit.ts → runAudit` and writes
   `.superbuilder/source-audits/AUDIT-<UTC-timestamp>.md`. Token resolution
   order: `GH_TOKEN` env, then `GITHUB_TOKEN`, then anonymous (warned).

3. Read the latest `AUDIT-*.md`. For every source:
   - confirm `pinned`, `latest`, `compare` URL.
   - if `truncated: true`, open the compare URL in a browser — large diffs
     are summarized only; you must read the diff yourself before approving.
   - re-validate the CLI's heuristic classification against your own read.

4. **Map to Superbuilder components.** For each upstream skill that maps to one of our `skills/`, `agents/`, or `commands/` files, mark which Superbuilder file is potentially affected (use `grep -l <source-name> skills agents commands docs`).

5. **Hand off to `source-update-auditor` agent** with the classified diff. The agent produces an update patch as a draft, not a commit.

6. **Approval gate.** `behavior` and `security` changes require explicit user approval. `capability` and `irrelevant` may be queued. `breaking` requires a regression-eval plan before any patch.

7. **Append synthesis** to the audit report (the CLI writes the data; the agent writes the recommendation): per source, mapped components and recommended action; overall summary, blockers needing approval, suggested next /superbuilder:supersources cadence.

## Hard rules

- Never auto-update `source-lock.json` for `behavior` or `security` changes.
- Never replace local hardened policy with upstream defaults.
- Treat third-party skills as untrusted until audited.
- If a source publishes new skill files, do NOT auto-import them. Catalog them and let the user decide.
