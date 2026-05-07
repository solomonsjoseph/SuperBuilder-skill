---
name: 11-update-sources
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

The data fetch runs through the orchestrator's `sources` CLI verb — it
handles auth, pagination, rate-limit backoff, and large-diff truncation.
The agent reads the resulting markdown report.

1. Run the CLI verb to fetch + classify:

   ```bash
   bin/superbuilder-sources --root .superbuilder
   ```

   That dispatches to `orchestrator/src/source-audit.ts → runAudit`, which:
   - reads `.superbuilder/source-lock.json`,
   - fetches each source's default-branch HEAD via `/repos/:owner/:repo` then `/commits/:branch`,
   - walks `/repos/:owner/:repo/compare/:base...:head?per_page=100&page=N` until `Link: rel="next"` is absent,
   - honors `Retry-After` and `X-RateLimit-Reset` headers, exponential backoff on 403/429,
   - flags `truncated: true` when files > 250 OR `additions+deletions > 10000`,
   - writes `.superbuilder/source-audits/AUDIT-<UTC-timestamp>.md`.

   Auth: `GH_TOKEN` then `GITHUB_TOKEN` then anonymous (warned, lower limit).

2. Open the freshest `AUDIT-*.md`. For every source row:
   - confirm `pinned`, `latest`, and the compare URL.
   - if `truncated: true`, open the compare URL in a browser — the report is summary-only for large diffs.
   - re-read the heuristic classification: security → breaking → irrelevant → capability → behavior → unknown.
3. **Map to Superbuilder components**: which `skills/`, `agents/`, `commands/` files mention this source? Use `grep -l "<source-name>" skills agents commands docs`.

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
