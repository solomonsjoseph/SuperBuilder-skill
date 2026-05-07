---
description: Read .superbuilder/ state and print which stories passed, which failed, open gates, current risks, and the next recommended action.
allowed-tools: Read, Glob, Bash
---

Report Superbuilder state for the current project.

1. Read `.superbuilder/prd.json`. If missing, tell the user no PRD exists yet and recommend `/superbuilder:superbuild`.
2. Read `.superbuilder/progress.md` (tail).
3. List `.superbuilder/runs/` and `.superbuilder/evidence/` to confirm run+evidence pairing.

## Output

```
# Superbuilder status — <project>

Branch (target → integration): <targetBranch> → <integrationBranch>
Source-lock pinned: <yes/no>

## Stories
- ✅ US-001 <title> — passed (attempts=N, evidence: tests, security, review)
- ❌ US-002 <title> — failed (attempts=N, lastFailure=<one-liner>)
- ⏳ US-003 <title> — pending

## Open gates
- ...

## Risks
- ...

## Recommended next action
- e.g. "Run /superbuilder:superheal on US-002 — repeat failure pattern detected"
```

If `passes=true` but no evidence files exist for that story, flag it loudly: this is a false-pass and the orchestrator must re-run the story.
