# Superbuilder

A Claude Code plugin that turns an existing LLM into a proactive, security-default software-engineering operator.

You dump a rough idea once, approve a plan once, and Superbuilder coordinates implementation, testing, review, security audit, and PR preparation inside controlled safety boundaries — stopping before production deploy until you explicitly approve.

## What's in the box

- **12 skills** covering intake, context sync, PRD authoring, story planning, triage, build, verify, review, architecture guard, ship-readiness, self-improvement, and source updates.
- **11 specialist agents** (product-griller, planner, context-cartographer, implementer, test-engineer, security-auditor, reviewer, architect, release-manager, self-improvement-researcher, source-update-auditor).
- **7 slash commands**: `/superbuilder:superbuild`, `superaudit`, `superstatus`, `superreview`, `superheal`, `supersources`, `supership`.
- **Safety hooks** that block destructive shell, secret writes, and unapproved deploys; capture evidence after tool use; verify completion claims at Stop.
- **`bin/` dispatchers** wrapping a TypeScript orchestrator.
- **`orchestrator/`** — story scheduler, gate runner, Sandcastle adapter, PRD validator, package-manager detection.
- **Source-lock + audit** to detect drift in upstream skill/runtime repos.

## Status

This release is a **foundation**, not a turnkey product. See `docs/LIMITATIONS.md` for what's wired, what's stubbed, and what is intentionally out of scope. The architecture, schemas, security model, and skill/agent surface are complete; the autonomous Sandcastle execution path needs verification against the upstream Sandcastle API before relying on it for unattended runs.

## Architecture in one diagram

```
   user idea
      │
      ▼
  /superbuilder:superbuild
      │
      ▼
  product-griller ──► planner ──► context-cartographer
      │                                         │
      ▼                                         ▼
  .superbuilder/intake.md      .superbuilder/context/* + PRD.md
      │
      ▼
  03-plan-stories ──► .superbuilder/prd.json (schemaVersion v2)
      │
      ▼
   PLAN APPROVAL  (AskUserQuestion)
      │
      ▼
  orchestrator (bin/superbuilder-run)
   ├─► createSandbox(branch=superbuilder/<US>-<slug>)
   │      ├─► implementer
   │      ├─► test-engineer
   │      └─► reviewer + security-auditor + (architect)
   ├─► gates: typecheck, lint, test, integration, security, secret scan,
   │           dep audit, license, browser, a11y, perf
   └─► evidence/<US>/* + passes:true → merge to superbuilder/integration
      │
      ▼
  /superbuilder:supership  (Phase 1 always; Phase 2 only with approval)
```

Every critical edge has a hook checkpoint; see `docs/SECURITY.md`.

## Quick start

```bash
git clone <this-repo> superbuilder
( cd superbuilder/orchestrator && npm install && npm run build )
claude --plugin-dir "$(pwd)/superbuilder"

# in your target project:
> /superbuilder:superaudit
> /superbuilder:superbuild
```

Full install instructions: `docs/INSTALL.md`.

## Why this combination

| Source | Role |
|---|---|
| Matt Pocock skills | alignment, grilling, domain language, triage, TDD, diagnosis, architecture |
| Addy Osmani agent-skills | canonical SDLC: spec, plan, build, verify, review, ship, gates |
| Ralph | PRD/story/progress state machine pattern (not the unsafe shell loop) |
| Sandcastle | only autonomous coding-agent execution engine |
| Karpathy autoresearch | eval-driven, measured self-improvement (method only) |

Detailed source map and per-source decisions: `docs/SOURCE-MAP.md`.

## The non-negotiables

- **No evidence = no pass.** The Stop hook enforces this against `.superbuilder/evidence/<US>/`.
- **No autonomous deploy.** Production release requires `deploymentAllowed: true` in the PRD, a signed approval file, AND the literal `approve-deploy` flag.
- **No `noSandbox()` for autonomous execution.** Manual interactive debugging only.
- **No silent dependency adds.** New deps trigger approval per the PRD's `humanApprovalRequiredFor`.
- **No self-improvement that weakens safety.** `falsePassRate` must remain 0; security regression `none`.
- **No silent absorption of upstream skill changes.** Behavior/security drift requires explicit per-file approval.

## Files

```
.claude-plugin/plugin.json
skills/00..11-*/SKILL.md
agents/*.md
commands/*.md
hooks/hooks.json + hooks/scripts/*.sh
bin/superbuilder, superbuilder-run, -heal, -sources, -gates
orchestrator/{package.json, tsconfig.json, src/*.ts}
docs/{ARCHITECTURE,SECURITY,SOURCE-MAP,EVALS,INSTALL,LIMITATIONS}.md
```

## License

MIT.
