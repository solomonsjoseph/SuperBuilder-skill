---
description: Run a measured self-healing experiment — baseline → one mutation → fixed eval → keep/revert. Never weakens safety gates.
argument-hint: [problem statement, e.g. "US-003 keeps failing test depth"]
allowed-tools: Read, Write, Edit, Bash, Task
---

Self-heal target: $ARGUMENTS

You MUST follow the Autoresearch-style protocol. Anything that skips a step is invalid.

## Required artifacts (write all of these to .superbuilder/experiments/EXP-NNN.json)

1. **problemStatement** — what is failing, observed N times.
2. **baselineMetric** — measured number BEFORE any change. Pick from: `storyPassRate`, `falsePassRate` (must be 0), `averageRetries`, `diagnosisQuality`, `securityBlockSuccess`, `regressionCount`, `tokenCost`, `sourceGroundingRate`, `contextSufficiency`.
3. **editableSurface** — exactly one of: `skills/*/SKILL.md`, `agents/*.md`, `commands/*.md`, orchestrator config defaults, gate ordering, retry policy, eval rubric.
4. **mutation** — one change. ONE. Describe diff and rationale.
5. **evalTaskSet** — fixed list of tasks with deterministic pass/fail. Same set used for baseline and after.
6. **scoreBefore / scoreAfter** — same metric, same set.
7. **safetyRegression** — did any blocked operation succeed? Did any false pass appear? Must be `none` to keep.
8. **decision** — `keep` | `revert`.
9. **log** — full timeline.

## Hard prohibitions

The mutation must NOT touch:
- `hooks/hooks.json` blocking rules
- approval policy
- production deploy guardrails
- secret-scan rules
- the requirement that stories have evidence to pass

Invoke `10-self-improve` skill which holds the full protocol. Hand the resulting EXP-NNN.json to `self-improvement-researcher` agent for synthesis.

## Output

Print a one-screen summary:
- problem
- mutation
- baseline → after (delta + safety regression status)
- decision
- file path of the experiment log
