---
name: 10-self-improve
description: Use only via /superbuilder:superheal when a repeated failure pattern justifies a measured workflow experiment. Runs Autoresearch-style baseline → one mutation → fixed eval → keep/revert. Forbidden from touching safety, approval, or deploy policy. Reverts unmeasured changes.
---

# Self-Improve

## Purpose

Improve the prompts, agents, retry policies, and gate ordering — only when the improvement is measurably better and does not weaken safety. Anything else is theater.

## When to invoke

- Three or more consecutive failures with the same diagnosis class on the same kind of story.
- Token cost or runtime drift exceeds an explicit budget set in PRD.
- The user explicitly runs `/superbuilder:superheal`.

## Two modes

### Runtime self-heal

Improves the *current run* only. May edit:
- the failing story's prompt (in `.superbuilder/prompts/<US>-*.md`)
- the context packet handed to agents
- agent routing for this story
- retry plan
- diagnosis instructions

### Plugin self-improve

Improves Superbuilder itself. Editable surfaces:
- `skills/*/SKILL.md`
- `agents/*.md`
- `commands/*.md`
- orchestrator config defaults
- gate ordering policy
- retry policy
- eval rubrics

Plugin self-improve produces a PR against this plugin repo, never auto-merged.

## Forbidden — never editable without explicit human approval

- `hooks/hooks.json` block list
- approval policy in any PRD
- production deploy gating
- secret-scan rules
- the rule that stories require evidence to pass

## Required protocol (every experiment)

1. **problemStatement** — what fails, observed N times.
2. **baselineMetric** — measured number BEFORE any change.
3. **editableSurface** — exactly one of the lists above.
4. **mutation** — one change. Diff included.
5. **evalTaskSet** — fixed list of tasks with deterministic pass/fail. Same set for baseline and after.
6. **scoreBefore / scoreAfter**.
7. **safetyRegression** — must be `none` to keep.
8. **decision** — `keep` or `revert`.
9. **log** — written to `.superbuilder/experiments/EXP-NNN.json`.

## Metrics

| Metric | Definition |
|---|---|
| storyPassRate | % stories with all relevant gates green |
| falsePassRate | stories marked passes=true without evidence — MUST be 0 |
| averageRetries | retries per story over the eval set |
| diagnosisQuality | rubric score 0–3 |
| securityBlockSuccess | unsafe ops blocked / unsafe ops attempted |
| regressionCount | new failures introduced by mutation |
| tokenCost | tokens / story over the eval set |
| sourceGroundingRate | claims with source citations / total claims |
| contextSufficiency | rubric score 0–3 |

## Keep / revert rule

> Keep only if the target metric improved AND `regressionCount == 0` AND `safetyRegression == none` AND `falsePassRate == 0`.
>
> Revert if improvement is unmeasured, ambiguous, unsafe, or only cosmetically better.

## Source basis

Method adapted from Karpathy `autoresearch`. Do not import autoresearch as code.

## Anti-rationalization rules

- "It's a small tweak, no eval needed" — every mutation requires baseline + after on the same fixed set.
- "I'll skip the safety regression check, it's clearly fine" — never. Re-run the security test set.
- "Keep the change because it feels better" — feelings aren't metrics. Revert.
- "Run two mutations at once to save time" — no. One mutation per experiment, full stop.
