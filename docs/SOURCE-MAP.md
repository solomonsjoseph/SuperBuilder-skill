# Superbuilder — Source Map

This document records, for each of the five source repos, what we kept, what we
adapted, what we rejected, and which Superbuilder components depend on each.

The bootstrap `.superbuilder/source-lock.json` pins each source. Run
`/superbuilder:supersources` to audit drift.

## Pinned sources (bootstrap; update via supersources)

```json
{
  "sources": {
    "addyosmani/agent-skills": {
      "ref": "TBD-on-first-supersources-run",
      "lastChecked": null,
      "mappedComponents": [
        "skills/00-intake-refine",
        "skills/01-context-sync",
        "skills/02-write-prd",
        "skills/03-plan-stories",
        "skills/05-build-slice",
        "skills/06-verify-slice",
        "skills/07-review-slice",
        "skills/08-architecture-guard",
        "skills/09-ship-readiness",
        "agents/reviewer.md",
        "agents/security-auditor.md",
        "agents/test-engineer.md",
        "agents/release-manager.md",
        "commands/superreview.md",
        "commands/supership.md"
      ]
    },
    "mattpocock/skills": {
      "ref": "TBD-on-first-supersources-run",
      "lastChecked": null,
      "mappedComponents": [
        "skills/00-intake-refine",
        "skills/01-context-sync",
        "skills/02-write-prd",
        "skills/03-plan-stories",
        "skills/04-triage-existing-work",
        "skills/05-build-slice",
        "skills/07-review-slice",
        "skills/08-architecture-guard",
        "agents/product-griller.md",
        "agents/architect.md"
      ]
    },
    "mattpocock/sandcastle": {
      "ref": "TBD-on-first-supersources-run",
      "lastChecked": null,
      "mappedComponents": [
        "orchestrator/src/sandcastle-runner.ts",
        "orchestrator/src/scheduler.ts"
      ]
    },
    "snarktank/ralph": {
      "ref": "TBD-on-first-supersources-run",
      "lastChecked": null,
      "mappedComponents": [
        "skills/03-plan-stories",
        "orchestrator/src/types.ts",
        "orchestrator/src/prd.ts",
        "orchestrator/src/scheduler.ts",
        "docs/ARCHITECTURE.md"
      ]
    },
    "karpathy/autoresearch": {
      "ref": "TBD-on-first-supersources-run",
      "lastChecked": null,
      "mappedComponents": [
        "skills/10-self-improve",
        "agents/self-improvement-researcher.md",
        "commands/superheal.md",
        "docs/EVALS.md"
      ]
    }
  }
}
```

## Keep / adapt / reject (per source)

### addyosmani/agent-skills
**Kept:** the SDLC spine — idea-refine, spec-driven-development, planning-and-task-breakdown, incremental-implementation, test-driven-development, context-engineering, source-driven-development, frontend-ui-engineering, api-and-interface-design, browser-testing-with-devtools, debugging-and-error-recovery, code-review-and-quality, code-simplification, security-and-hardening, performance-optimization, git-workflow-and-versioning, ci-cd-and-automation, deprecation-and-migration, documentation-and-adrs, shipping-and-launch.
**Adapted:** the three-layer separation (personas, skills, slash commands) becomes our skills + agents + commands.
**Rejected:** Addy's `/ship` fan-out is reused conceptually but routed through Superbuilder's orchestrator (so the Stop hook can verify evidence) rather than as direct persona invocations.

### mattpocock/skills
**Kept:** grill-me, grill-with-docs, tdd, diagnose, improve-codebase-architecture, setup-matt-pocock-skills, triage, to-prd, to-issues, zoom-out, git-guardrails-claude-code, setup-pre-commit.
**Adapted:** the relentless-interview discipline is folded into `00-intake-refine` and the `product-griller` agent.
**Rejected:** caveman, write-a-skill, migrate-to-shoehorn, scaffold-exercises — optional, not core.

### mattpocock/sandcastle
**Kept:** `createSandbox()` for multi-pass story execution.
**Adapted:** branch policy (`superbuilder/<US-id>-<slug>`), provider policy (docker/podman/vercel), package-manager auto-detection.
**Rejected:** `noSandbox()` for autonomous execution.

### snarktank/ralph
**Kept:** PRD → user-stories → progress-log loop.
**Adapted:** schema (`superbuilder.prd.v2`), explicit `.superbuilder/` state root, evidence requirements.
**Rejected:** raw `ralph.sh` shell loop as the trusted core; absolute path ambiguity (we use one explicit `.superbuilder/` root).

### karpathy/autoresearch
**Kept:** the protocol — editable surface → fixed-budget eval → objective score → keep/revert.
**Adapted:** mapped to skill/agent/prompt edits with safety regression as a hard gate.
**Rejected:** importing autoresearch as code; the protocol is encoded in `10-self-improve` and the `self-improvement-researcher` agent.

## Update workflow

`/superbuilder:supersources` audits each source and writes
`.superbuilder/source-audits/AUDIT-<timestamp>.md`. Classifications:

| Class | Behavior |
|---|---|
| irrelevant | note only |
| capability | catalog; never auto-import |
| behavior | per-file approval + regression eval |
| security | per-file approval + regression eval; treat as untrusted |
| breaking | mandatory regression eval before any patch |
