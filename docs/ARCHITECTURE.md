# Superbuilder — Architecture

This document is the canonical reference for Superbuilder's data shapes,
state layout, and component responsibilities. Everything else (skills,
agents, commands, orchestrator) reads from here.

## State root

All state for a Superbuilder run lives under `.superbuilder/` in the
**target project**, never inside the plugin.

```
.superbuilder/
  intake.md                  # 00-intake-refine output
  context/                   # 01-context-sync output
    stack.json
    domain.md
    tree.md
    adrs.md
    gates.json
    risks.md
  triage.md                  # 04-triage-existing-work (only if existing backlog)
  PRD.md                     # 02-write-prd output (human-readable)
  prd.json                   # 03-plan-stories output (machine-readable)
  source-lock.json           # /superbuilder:supersources
  source-audits/
    AUDIT-<timestamp>.md
  prompts/
    <US-id>-implement.md
    <US-id>-verify.md
    <US-id>-review.md
  runs/
    <US-id>.json
  evidence/
    <US-id>/
      tests.log
      typecheck.log
      lint.log
      browser.md
      a11y.md
      perf.md
      security.log
      review.md
      diff.patch
  decisions/
    ADR-NNNN.md
  experiments/
    EXP-NNN.json
  approvals/
    deploy-<datestamp>.txt   # human-signed; required for /supership approve-deploy
  reports/
    release-<timestamp>/
      release-notes.md
      rollback.md
      staged-rollout.md
      pr-body.md
      gate-sweep.md
      risks.md
  progress.md                # human-readable run log
  last-run.json              # machine-readable last run report
```

## PRD JSON contract

`schemaVersion: "superbuilder.prd.v2"`. The orchestrator's `validate.ts`
enforces this. Required shape:

```jsonc
{
  "schemaVersion": "superbuilder.prd.v2",
  "project": "string",
  "branchName": "string",
  "targetBranch": "string",            // user's existing branch; never "main" by default
  "integrationBranch": "superbuilder/integration",
  "description": "string",
  "riskLevel": "low | medium | high",
  "deploymentAllowed": false,          // ALWAYS false at PRD time
  "sourceRefs": {
    "addyosmani/agent-skills": "<commit-or-tag>",
    "mattpocock/skills": "<commit-or-tag>",
    "mattpocock/sandcastle": "<version-or-commit>",
    "snarktank/ralph": "<commit-or-tag>",
    "karpathy/autoresearch": "<commit-or-tag>"
  },
  "humanApprovalRequiredFor": [
    "production deploy",
    "destructive commands",
    "secrets changes",
    "billing changes",
    "auth changes",
    "database destructive migrations",
    "dependency additions",
    "security policy changes",
    "quality gate weakening"
  ],
  "qualityGates": {
    "typecheck": "string | null",
    "lint": "string | null",
    "format": "string | null",
    "test": "string | null",
    "integrationTest": "string | null",
    "security": "string | null",
    "secretScan": "string | null",
    "dependencyAudit": "string | null",
    "licenseCheck": "string | null",
    "browser": "string | null",
    "accessibility": "string | null",
    "performance": "string | null"
  },
  "userStories": [
    {
      "id": "US-001",
      "title": "string",
      "description": "string",
      "acceptanceCriteria": ["string"],
      "priority": 1,
      "riskLevel": "low | medium | high",
      "filesLikelyTouched": ["string"],
      "dependencies": ["US-000"],
      "passes": false,
      "attempts": 0,
      "lastFailure": null,
      "evidence": {
        "tests": [], "security": [], "review": [], "browser": [],
        "accessibility": [], "performance": [], "commits": [], "diffs": []
      }
    }
  ]
}
```

## Story execution state machine

```
load .superbuilder/prd.json              [orchestrator]
load .superbuilder/progress.md
validate sourceRefs + policy
loop:
  pick highest-priority story whose deps all pass
  create story branch    superbuilder/<US-id>-<slug>
  create Sandcastle sandbox on that branch
  context-cartographer (only if context/* missing)
  implementer  (1 pass)
  test-engineer (1 pass)
  reviewer/security/architect fan-out
  if any failure:
    diagnose, write failure evidence, retry within attemptsPerStory cap
  if pass:
    write evidence, set passes=true, merge to superbuilder/integration
  continue
produce final report
STOP before production deploy
```

Iteration caps (defaults; user-overridable):

| Scope | Default |
|---|---:|
| attemptsPerStory | 3 |
| repairLoopsPerAttempt | 2 |
| fullRunStories | unbounded |
| selfHealExperiments per failure class | 3 |

## Why this combination

| Source | Role | Boundary |
|---|---|---|
| Matt Pocock skills | Alignment, grilling, domain language, triage, TDD, diagnosis, architecture sanity, git/pre-commit guardrails | Used for shaping; not for execution discipline |
| Addy Osmani agent-skills | Canonical SDLC: spec, plan, build, verify, review, ship, gates | Used as the lifecycle spine |
| Ralph | PRD/story/progress state machine, autonomous iteration pattern | Adapted as state shape only — never the unsafe shell loop |
| Sandcastle | Sandboxed coding-agent runtime (Docker/Podman/Vercel) | Only autonomous execution path; `noSandbox()` is forbidden |
| Karpathy autoresearch | Eval-driven self-improvement method | Adapted as protocol only — never imported as code |

## Component responsibilities

| Component | Owns |
|---|---|
| `skills/00-intake-refine` | Idea grilling, push-back |
| `skills/01-context-sync` | Project/domain map; package-manager detection |
| `skills/02-write-prd` | Implementation-grade PRD markdown |
| `skills/03-plan-stories` | `prd.json` materialization |
| `skills/04-triage-existing-work` | Existing backlog classification |
| `skills/05-build-slice` | One-story implementation discipline |
| `skills/06-verify-slice` | Evidence capture per gate |
| `skills/07-review-slice` | Multi-reviewer fan-out + diagnosis |
| `skills/08-architecture-guard` | ADRs, deepening proposals |
| `skills/09-ship-readiness` | Release notes, rollback, staged rollout, PR |
| `skills/10-self-improve` | Measured workflow experiments |
| `skills/11-update-sources` | Upstream source audit + impact classification |
| `agents/*.md` | Narrow, role-specific subagents |
| `commands/*.md` | User-facing entry points |
| `hooks/hooks.json` + `hooks/scripts/*` | Block destructive ops, capture evidence, gate Stop |
| `bin/*` | Shell dispatchers around the orchestrator |
| `orchestrator/` | Story scheduler, gate runner, Sandcastle adapter, validator |

## Quality gates: `failed` vs `errored`

The gate runner (`orchestrator/src/gates.ts`) distinguishes two kinds of non-success outcomes so operators know whether to fix code or fix configuration:

- **`failed`** — the gate program was spawned successfully and exited non-zero. This is a real test/lint/typecheck failure: the implementation under test does not meet the criterion. The scheduler records `gate failed: <name> (exit <n>)` in `lastFailure`, the operator should look at code.
- **`errored`** — the gate could not even run as configured. Causes: shell-meta refusal, allow-list refusal, `spawn ENOENT` (program not on PATH), or the per-gate timeout (default 5 minutes). The scheduler records `gate misconfigured: <name> (<reason>)` in `lastFailure`, the operator should fix `qualityGates` in `prd.json` or the host environment, not application code.

Errored outcomes still count toward `attemptsPerStory` — a misconfigured gate is not a free pass — but the failure note guides remediation toward configuration rather than implementation. Both `failed` and `errored` block the story from passing; `passed` and `skipped` (no command configured) do not.

## Branch policy

- `targetBranch` — the user's existing branch; **never `main`** unless the user explicitly chooses it.
- `integrationBranch` — `superbuilder/integration`; accumulates passing stories.
- `superbuilder/<US-id>-<slug>` — one branch per story; merges to integration only after review approval.
- Autonomous code never writes to `main` or the target production branch.

## Approval gates (orchestrator-level)

1. **Plan approval** — explicit user yes via `AskUserQuestion` before any sandbox runs.
2. **Per-story merge** — passes only after all reviewers approve AND evidence files exist.
3. **Release** — `/superbuilder:supership` Phase 1 always runs; Phase 2 (deploy) requires `deploymentAllowed: true` + signed approval file + literal `approve-deploy` argument.

The Stop hook double-checks (2) and (3) at the conversation level.
