---
name: superbuilder-update-sources
description: Use via /superbuilder:supersources to audit upstream source repos (agent-skills, mattpocock/skills, sandcastle, ralph, autoresearch) for changes since the pinned ref. Classifies impact, maps to bundled components, never silently absorbs behavior or security changes.
---

# Update Sources

## Purpose

Bundled prompts and skills can drift from upstream. Drift is a supply-chain risk. This skill audits the drift, classifies it, and produces an update plan — but never silently changes behavior.

## When to invoke

- `/superbuilder:supersources` is run.
- The user asks "is the plugin up to date?"
- Before major releases of Superbuilder itself.

## Required outputs

1. **`.superbuilder/source-lock.json`** — bootstrap if missing. Shape per `docs/SOURCE-MAP.md`.
2. **`.superbuilder/source-audits/AUDIT-<timestamp>.md`** — per-source: pinned ref, latest ref, classification, mapped components, recommended action.

## Audit steps

For each source:

1. Read the pinned ref from `source-lock.json`.
2. Fetch the latest ref via the GitHub API (commits or releases page) using `WebFetch`.
3. List changed files between the two refs (also via WebFetch on the GitHub compare page).
4. For each changed file, classify into:
   - **irrelevant** — docs, CI, tests for the source repo, anything not affecting bundled behavior.
   - **capability** — new tool, new skill, new template that we may want to import.
   - **behavior** — existing prompt/skill text changed. May change how Superbuilder reasons.
   - **security** — defaults, allow-lists, block-lists changed.
   - **breaking** — incompatible API change for Sandcastle, Ralph schema, etc.
5. **Map to Superbuilder components**: which `skills/`, `agents/`, `commands/` files mention this source? Use `grep -l "<source-name>" skills agents commands docs`.

## Approval gates

| Classification | Action |
|---|---|
| irrelevant | Note in audit. No change. |
| capability | Catalog. Proposal goes to user, never auto-imported. |
| behavior | Requires explicit user approval per file. Then run regression evals (see `10-self-improve`) before accepting. |
| security | Same as behavior. Treat changed defaults as untrusted until audited line-by-line. |
| breaking | Update plan with regression eval REQUIRED before any change. |

## Hand-off

Hand the audit report to `source-update-auditor` agent for synthesis. The agent produces a draft update patch — never a commit. The user approves or rejects per file.

## Source basis

Inspired by GitHub's `gh skill` provenance pattern. The plugin's law: silent drift is a supply-chain risk, treat third-party skills as untrusted until audited.

## Anti-rationalization rules

- "Upstream knows best, just take their changes" — no. Their security defaults may be looser than ours.
- "Capability change, just import it" — catalog only. The user decides to import, you don't.
- "Behavior change is small, no eval needed" — no. Behavior changes always trigger regression evals.
- "Update lock without auditing" — never. The lock IS the audit trail.
