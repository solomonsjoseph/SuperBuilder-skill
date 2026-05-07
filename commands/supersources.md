---
description: Audit upstream source repos (Addy, Matt, Sandcastle, Ralph, Autoresearch) for changes since the pinned ref. Classify impact, propose update plan, never silently absorb.
allowed-tools: Read, Write, Edit, Bash, WebFetch, Task
---

Source-update audit for Superbuilder.

## Steps

1. Read `.superbuilder/source-lock.json`. If absent, generate one with the refs documented in `docs/SOURCE-MAP.md` and tell the user — that bootstrap counts as the first audit.

2. For each pinned source, fetch the latest ref via `WebFetch` against the GitHub commits API or releases page:
   - `addyosmani/agent-skills`
   - `mattpocock/skills`
   - `mattpocock/sandcastle`
   - `snarktank/ralph`
   - `karpathy/autoresearch`

3. **Classify each diff** into: `irrelevant`, `capability` (new tools/skills), `behavior` (changed prompts), `security` (changed defaults that affect blast radius), `breaking` (incompatible API).

4. **Map to Superbuilder components.** For each upstream skill that maps to one of our `skills/`, `agents/`, or `commands/` files, mark which Superbuilder file is potentially affected.

5. **Hand off to `source-update-auditor` agent** with the classified diff. The agent produces an update patch as a draft, not a commit.

6. **Approval gate.** `behavior` and `security` changes require explicit user approval. `capability` and `irrelevant` may be queued. `breaking` requires a regression-eval plan before any patch.

7. **Update report.** Write `.superbuilder/source-audits/AUDIT-<timestamp>.md` with:
   - per-source: pinned ref, latest ref, classification, mapped components, recommended action.
   - summary: count by classification, blockers needing approval, suggested next /superbuilder:supersources cadence.

## Hard rules

- Never auto-update `source-lock.json` for `behavior` or `security` changes.
- Never replace local hardened policy with upstream defaults.
- Treat third-party skills as untrusted until audited.
- If a source publishes new skill files, do NOT auto-import them. Catalog them and let the user decide.
