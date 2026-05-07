# Superbuilder Plugin — Updated Canvas Prompt

**Last source refresh:** 2026-05-05  
**Document type:** Markdown implementation prompt  
**Purpose:** Updated implementation prompt for building the Superbuilder Claude Code plugin after upstream skill/runtime changes.

---

## What Changed Since The Previous Draft

The architecture remains the same, but the implementation spec must be tightened.

Key updates:

1. **Addy Osmani `agent-skills` now matters more as an orchestration system, not just a skill pack.**
   - It currently exposes **20 core skills**, **3 specialist personas**, and **7 Claude Code slash commands**.
   - Its `0.6.0` release formalizes three layers: **personas**, **skills**, and **slash commands**.
   - `/ship` now performs a fan-out review using `code-reviewer`, `security-auditor`, and `test-engineer` before producing a go/no-go decision.

2. **Matt Pocock `skills` has more workflow coverage than before.**
   - Keep `grill-me`, `grill-with-docs`, `tdd`, `diagnose`, and `improve-codebase-architecture`.
   - Add `setup-matt-pocock-skills`, `triage`, `to-prd`, `to-issues`, `zoom-out`, `git-guardrails-claude-code`, and `setup-pre-commit` into the Superbuilder design.
   - Keep `caveman`, `write-a-skill`, `migrate-to-shoehorn`, and `scaffold-exercises` optional, not core.

3. **Sandcastle should be used through its current runtime API.**
   - Use `createSandbox()` for multi-run story execution: implement → test → review → repair.
   - Use `run()` only for one-shot tasks.
   - Use Docker by default, Podman as the safer local alternative where available, Vercel sandbox as optional cloud isolation.
   - Never use `noSandbox()` for autonomous build execution.

4. **Ralph still supplies the right autonomous loop pattern, but not the secure implementation.**
   - Keep the PRD/user-story/progress state machine.
   - Do not use raw `ralph.sh` as the trusted core.
   - Avoid Ralph path ambiguity by using one explicit project state root: `.superbuilder/`.

5. **Autoresearch should become a strict eval-driven improvement loop.**
   - Do not import it directly.
   - Copy the method: editable surface → fixed budget eval → objective score → keep/revert.
   - Self-improvement must be measurable and must not weaken security, approvals, or quality gates.

6. **Source updates must become part of the plugin.**
   - Add a source-update workflow that detects upstream skill changes, classifies impact, runs regression evals, and only then updates bundled prompts/skills.
   - Pin or record source provenance. Silent skill drift is a supply-chain risk.

Reference URLs:

- https://github.com/addyosmani/agent-skills
- https://github.com/addyosmani/agent-skills/releases
- https://github.com/mattpocock/skills
- https://github.com/mattpocock/sandcastle
- https://github.com/snarktank/ralph
- https://github.com/karpathy/autoresearch
- https://code.claude.com/docs/en/plugins-reference
- https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/

---

# Prompt

## Role

You are a principal software architect, senior AI-agent engineer, security engineer, plugin systems designer, and autonomous software delivery architect.

Design and implement a Claude Code plugin named **Superbuilder**.

You must be skeptical. Do not blindly merge repos. Do not build prompt soup. Preserve each source’s strongest capability, remove duplication, enforce security, and make the plugin measurable.

The user wants a system where they can dump a software idea, approve a plan, and then let the LLM coordinate the implementation from scratch or inside an existing project with minimal human involvement until final verification.

The system must push back when the user’s idea is vague, unsafe, overbuilt, under-scoped, legally/security risky, or technically incoherent.

---

## Source Material

Use these five repositories as source material:

1. https://github.com/addyosmani/agent-skills
2. https://github.com/mattpocock/skills
3. https://github.com/mattpocock/sandcastle
4. https://github.com/snarktank/ralph
5. https://github.com/karpathy/autoresearch

You must inspect the current versions before implementation. Do not assume the files are unchanged from this prompt.

---

## What Superbuilder Is

**Superbuilder** is one bundled Claude Code plugin that turns an existing LLM into a proactive, security-default software-engineering operator.

It is not:

- One giant `SKILL.md`.
- A copied pile of unrelated skills.
- A wrapper around unsafe shell loops.
- A magic self-improving agent with no metrics.
- A production deploy bot.

It is a coordinated plugin containing:

- Skills
- Slash commands
- Specialist agents
- Safety hooks
- Optional monitors
- `bin/` executables
- TypeScript orchestrator
- Sandcastle execution adapter
- PRD/story scheduler
- Source-update audit workflow
- Eval-driven self-improvement loop

The human should mainly appear at:

1. **Planning approval**
2. **Final release / production approval**

The plugin must not silently deploy production-impacting changes.

---

## Core Objective

When the user runs:

```text
/superbuilder:superbuild
```

Superbuilder must execute this flow:

```text
idea dump
→ idea refinement and grilling
→ context/domain sync
→ source-backed PRD
→ Ralph-style prd.json story plan
→ human planning approval
→ story-by-story sandbox execution
→ implement/test/review/security loop
→ failed-story diagnosis and retry
→ measured self-healing when useful
→ final PR-ready implementation report
→ human final approval
→ optional release/deploy command, still gated
```

The system is successful only if it produces evidence, not vibes.

Default law:

```text
No evidence = no pass.
No pass = no merge.
No explicit production approval = no deploy.
```

---

## Updated Best Combination

Use this combination:

```text
Matt Pocock skills
= user alignment, domain language, issue shaping, diagnosis, architecture sanity

Addy Osmani agent-skills
= canonical SDLC workflow, quality gates, security, review, shipping discipline

Ralph
= PRD/story/progress state machine and autonomous iteration pattern

Sandcastle
= only trusted coding-agent execution engine

Karpathy Autoresearch
= fixed-budget, metric-backed self-improvement method
```

Final formula:

```text
Matt alignment + Addy SDLC + Ralph state + Sandcastle runtime + Autoresearch eval loop = Superbuilder
```

This is still the best balanced architecture. The updates do not replace it. They make it stricter.

---

## Why Only This Combination

| Source | Updated role in Superbuilder | Keep / adapt / avoid |
|---|---|---|
| `mattpocock/skills` | Alignment, domain language, PRD conversion, issue slicing, triage, TDD, diagnosis, architecture improvement, git/pre-commit guardrails | Keep targeted skills. Merge overlapping TDD/diagnosis with Addy gates. |
| `addyosmani/agent-skills` | Canonical SDLC: idea refine, spec, plan, build, context, source grounding, UI, API, browser testing, debugging, review, simplification, security, performance, git, CI/CD, migration, docs, ship | Use as the engineering lifecycle spine. |
| `snarktank/ralph` | User-story state, `passes` status, progress persistence, fresh-context iteration | Adapt the pattern. Do not trust raw shell loop as secure core. |
| `mattpocock/sandcastle` | Sandboxed agent orchestration, branch/worktree isolation, multi-run story execution, commit capture | Use as the only autonomous execution runtime. |
| `karpathy/autoresearch` | Self-improvement through controlled experiments and objective metrics | Adapt the loop. Do not import directly. |

Rejected variants:

| Alternative | Why it loses |
|---|---|
| Addy + Matt only | Strong workflow guidance, but no true sandboxed autonomous execution. |
| Ralph only | Autonomous, but too blunt and under-gated for a security-default system. |
| Sandcastle only | Strong execution, weak product planning and durable story state. |
| Autoresearch-first | Optimizes experiments, not software delivery. |
| One mega-skill | Prompt soup. Bad routing. High token waste. Weak maintainability. |
| Plugin with no orchestrator | Too passive. Skills alone do not create a reliable build loop. |

---

## Updated Capability Map

### Addy Osmani `agent-skills` — Use As SDLC Spine

Keep these as canonical lifecycle inputs:

| Phase | Addy skills to incorporate |
|---|---|
| Define | `idea-refine`, `spec-driven-development` |
| Plan | `planning-and-task-breakdown` |
| Build | `incremental-implementation`, `test-driven-development`, `context-engineering`, `source-driven-development`, `frontend-ui-engineering`, `api-and-interface-design` |
| Verify | `browser-testing-with-devtools`, `debugging-and-error-recovery` |
| Review | `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization` |
| Ship | `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `shipping-and-launch` |

Use Addy’s slash command model as inspiration:

```text
/spec
/plan
/build
/test
/review
/code-simplify
/ship
```

In Superbuilder, wrap these as internal phases instead of exposing them as disconnected commands.

Use Addy’s persona composition idea:

```text
code-reviewer + security-auditor + test-engineer
```

But enforce orchestration through Superbuilder’s orchestrator, not by letting personas invoke each other freely.

---

### Matt Pocock `skills` — Use As Alignment And Architecture Layer

Core Matt skills to preserve:

| Skill | Superbuilder use |
|---|---|
| `setup-matt-pocock-skills` | Initialize repo-specific context, issue tracker assumptions, triage vocabulary, domain docs. |
| `grill-me` | Ruthlessly clarify the raw idea before PRD. |
| `grill-with-docs` | Challenge the plan against existing `CONTEXT.md` and ADRs. |
| `to-prd` | Convert current conversation/context into PRD material. |
| `to-issues` | Break PRD/spec into vertical, independently workable issues/stories. |
| `triage` | Classify existing backlog/issues before autonomous work. |
| `zoom-out` | Force system-level understanding before touching unfamiliar code. |
| `tdd` | Red-green-refactor loop for behavior changes. |
| `diagnose` | Structured debugging loop: reproduce → minimize → hypothesize → instrument → fix → regression-test. |
| `improve-codebase-architecture` | Architecture rescue and deepening when entropy appears. |
| `git-guardrails-claude-code` | Feed hook policy for dangerous git commands. |
| `setup-pre-commit` | Use as optional repo hardening if project lacks pre-commit checks. |

Optional / non-core:

| Skill | Decision |
|---|---|
| `caveman` | Optional token-compression mode only. Not part of default flow. |
| `write-a-skill` | Optional command for extending Superbuilder skills. |
| `migrate-to-shoehorn` | Exclude unless project specifically uses that TypeScript testing pattern. |
| `scaffold-exercises` | Exclude from core. Domain-specific. |

---

### Ralph — Use As State Machine, Not Runtime

Keep the Ralph pattern:

```text
PRD
→ prd.json
→ userStories[]
→ priority
→ passes=false/true
→ progress log
→ repeated fresh agent iterations
```

Do not copy the unsafe runtime behavior directly.

Superbuilder must replace Ralph’s shell execution with:

```text
TypeScript scheduler
→ explicit state root
→ Sandcastle sandbox
→ gate runner
→ evidence writer
→ safe merge policy
```

Use this state root:

```text
.superbuilder/
  prd.json
  progress.md
  decisions/
    ADR-0001.md
  runs/
    US-001.json
  evidence/
    US-001/
      tests.log
      security.log
      review.md
      browser.md
      diff.patch
  experiments/
    EXP-001.json
```

Do not scatter `prd.json` or `progress.txt` across `scripts/ralph/`, project root, or task folders.

---

### Sandcastle — Use As Runtime

Use Sandcastle as the only autonomous execution engine.

Required runtime pattern:

```text
one story
→ one sandbox branch/worktree
→ multiple runs inside that sandbox
→ implementer run
→ test-engineer run
→ reviewer/security run
→ repair run if needed
→ evidence capture
→ safe merge to integration branch only
```

Use `createSandbox()` when a story needs multiple agent passes in the same branch.

Use `run()` only for single-shot, low-risk tasks.

Provider policy:

| Provider | Decision |
|---|---|
| Docker | Default local provider. |
| Podman | Preferred where rootless/local security is available. |
| Vercel sandbox | Optional cloud isolated provider. |
| no-sandbox | Manual interactive debugging only. Forbidden for autonomous build execution. |

Branch policy:

```text
target branch: existing project branch
integration branch: superbuilder/integration
story branch: superbuilder/US-001-short-slug
```

Never let autonomous implementation write directly to `main` or the target production branch.

Detect package manager from the project. Do not hardcode `npm`, `pnpm`, or `yarn`.

Detection order:

```text
pnpm-lock.yaml → pnpm
yarn.lock → yarn
package-lock.json → npm
bun.lockb / bun.lock → bun
poetry.lock → poetry
uv.lock → uv
Cargo.lock → cargo
go.mod → go
```

---

### Autoresearch — Use As Self-Improvement Method

Use this pattern:

```text
editable surface
→ baseline eval
→ one proposed mutation
→ fixed-budget run
→ objective score
→ keep if better
→ revert if worse or unmeasured
→ log result
```

Do not import Autoresearch code as product code.

Use two self-healing modes:

#### 1. Runtime self-heal

Used inside a target project when a story repeatedly fails.

May change:

- Story prompt
- Context packet
- Agent routing
- Test strategy
- Retry plan
- Failure diagnosis instructions

Must not change:

- Security gates
- Approval rules
- Deployment policy
- Evidence requirements

#### 2. Plugin self-improve

Used only when improving Superbuilder itself.

Editable surfaces:

```text
skills/*/SKILL.md
agents/*.md
commands/*.md
orchestrator config defaults
gate ordering policy
retry policy
eval rubrics
```

Non-editable without explicit human approval:

```text
security hooks
approval policy
production deploy rules
secret scanning rules
sandbox requirement
```

---

## Updated Plugin Structure

Implement this structure:

```text
superbuilder/
  .claude-plugin/
    plugin.json

  skills/
    00-intake-refine/
      SKILL.md
    01-context-sync/
      SKILL.md
    02-write-prd/
      SKILL.md
    03-plan-stories/
      SKILL.md
    04-triage-existing-work/
      SKILL.md
    05-build-slice/
      SKILL.md
    06-verify-slice/
      SKILL.md
    07-review-slice/
      SKILL.md
    08-architecture-guard/
      SKILL.md
    09-ship-readiness/
      SKILL.md
    10-self-improve/
      SKILL.md
    11-update-sources/
      SKILL.md

  agents/
    product-griller.md
    planner.md
    context-cartographer.md
    implementer.md
    test-engineer.md
    security-auditor.md
    reviewer.md
    architect.md
    release-manager.md
    self-improvement-researcher.md
    source-update-auditor.md

  commands/
    superbuild.md
    superaudit.md
    superstatus.md
    superreview.md
    superheal.md
    supersources.md
    supership.md

  hooks/
    hooks.json

  monitors/
    monitors.json

  bin/
    superbuilder
    superbuilder-run
    superbuilder-heal
    superbuilder-sources
    superbuilder-gates

  orchestrator/
    package.json
    tsconfig.json
    src/
      index.ts
      config.ts
      source-audit.ts
      source-lock.ts
      context.ts
      prd.ts
      scheduler.ts
      story-runner.ts
      sandcastle-runner.ts
      package-manager.ts
      gates.ts
      security.ts
      secrets.ts
      browser.ts
      metrics.ts
      memory.ts
      merge.ts
      self-heal.ts
      report.ts
      types.ts
      validate.ts

  docs/
    SECURITY.md
    ARCHITECTURE.md
    SOURCE-MAP.md
    EVALS.md
    INSTALL.md
    LIMITATIONS.md
```

Claude Code plugin components must live at the plugin root. Do not put `skills/`, `agents/`, `commands/`, or `hooks/` inside `.claude-plugin/`.

Do not rely on a root `CLAUDE.md` for plugin behavior. Put loadable behavior in skills, agents, commands, hooks, or executables.

---

## Updated Commands

### `/superbuilder:superbuild`

End-to-end idea-to-PR workflow.

Flow:

```text
intake
→ grill
→ context sync
→ PRD
→ story plan
→ planning approval
→ sandbox story loop
→ evidence gates
→ final report
```

### `/superbuilder:superaudit`

Audits the target project before autonomous work.

Outputs:

- Tech stack
- Existing tests
- Package manager
- Security risks
- CI/CD state
- Deployment surfaces
- Data/auth/billing risks
- Existing docs/ADRs
- Missing guardrails

### `/superbuilder:superstatus`

Reads `.superbuilder/prd.json`, progress, runs, and evidence.

Outputs:

- Passed stories
- Failed stories
- Current risks
- Open gates
- Last run status
- Next recommended action

### `/superbuilder:superreview`

Runs final review fan-out:

```text
code-reviewer
+ security-auditor
+ test-engineer
+ architect when needed
```

Then synthesizes one go/no-go report.

### `/superbuilder:superheal`

Runs measured self-healing.

Must require:

- Baseline metric
- One proposed mutation
- Fixed benchmark
- Keep/revert decision
- Experiment log

### `/superbuilder:supersources`

Checks upstream source repo changes.

Outputs:

- Current pinned source refs
- Upstream changes
- Added/removed/modified skills
- Security-impacting changes
- Behavior-impacting changes
- Recommended update plan
- Regression eval plan

### `/superbuilder:supership`

Prepares release readiness only.

Must not deploy unless the user explicitly approves production release.

---

## Updated Skill Consolidation

Create these Superbuilder skills.

| Superbuilder skill | Source basis | Purpose |
|---|---|---|
| `00-intake-refine` | Addy `idea-refine` + Matt `grill-me` | Convert vague idea into concrete, challenged proposal. |
| `01-context-sync` | Addy `context-engineering`, `source-driven-development` + Matt `setup-matt-pocock-skills`, `grill-with-docs`, `zoom-out` | Build correct project/domain context before planning or coding. |
| `02-write-prd` | Addy `spec-driven-development` + Matt `to-prd` + Ralph PRD pattern | Produce implementation-grade PRD. |
| `03-plan-stories` | Addy `planning-and-task-breakdown` + Matt `to-issues` + Ralph `prd.json` | Create executable vertical stories. |
| `04-triage-existing-work` | Matt `triage` + Addy planning/review | Triage existing issues/backlog before autonomous execution. |
| `05-build-slice` | Addy `incremental-implementation`, `test-driven-development`, `frontend-ui-engineering`, `api-and-interface-design` + Matt `tdd` | Build one vertical slice safely. |
| `06-verify-slice` | Addy `browser-testing-with-devtools`, `debugging-and-error-recovery`, `performance-optimization`, security/testing references | Prove the slice works with evidence. |
| `07-review-slice` | Addy `code-review-and-quality`, `code-simplification`, `security-and-hardening` + Matt `diagnose` | Review, simplify, secure, and diagnose. |
| `08-architecture-guard` | Matt `improve-codebase-architecture`, `zoom-out` + Addy `documentation-and-adrs` | Prevent ball-of-mud architecture. |
| `09-ship-readiness` | Addy `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `shipping-and-launch` | Prepare safe release package without auto-deploy. |
| `10-self-improve` | Karpathy Autoresearch pattern | Improve prompts/workflows by measured experiments only. |
| `11-update-sources` | GitHub skill provenance/update pattern + repo audit | Detect and safely absorb upstream skill changes. |

Rules:

1. Merge overlap; do not duplicate instructions.
2. Preserve unique strengths.
3. Keep skill triggers narrow.
4. Keep `SKILL.md` concise.
5. Put long checklists in supporting files.
6. Every skill must include verification evidence requirements.
7. Every skill must include anti-rationalization rules.

---

## Updated Agent Responsibilities

### `product-griller`

- Challenges the idea.
- Forces explicit success criteria.
- Rejects vague scope.
- Identifies missing product constraints.

### `planner`

- Converts refined idea into PRD, milestones, and user stories.
- Produces `.superbuilder/prd.json`.
- Does not start coding.

### `context-cartographer`

- Builds project map.
- Reads docs, ADRs, package scripts, tests, source layout, CI/CD.
- Produces context packet for other agents.

### `implementer`

- Builds one story only.
- Works only in Sandcastle sandbox branch/worktree.
- Does not deploy.

### `test-engineer`

- Writes and runs tests.
- Enforces red-green-refactor where behavior changes.
- Rejects shallow or fake tests.

### `security-auditor`

- Threat-models risky changes.
- Checks auth, secrets, input validation, dependency risk, permissions, unsafe shell behavior, data exposure, and production impact.

### `reviewer`

- Reviews correctness, maintainability, simplicity, acceptance criteria, and diff quality.

### `architect`

- Uses `zoom-out` and architecture-guard behavior.
- Creates ADRs.
- Flags overengineering and bad abstractions.

### `release-manager`

- Runs ship-readiness checks.
- Produces release notes, rollback notes, staged rollout plan.
- Cannot deploy without approval.

### `self-improvement-researcher`

- Runs controlled experiments.
- Keeps only measured improvements.
- Cannot weaken gates.

### `source-update-auditor`

- Checks upstream skill/runtime source changes.
- Classifies impact.
- Produces safe update plan.
- Requires regression evals before accepting source updates.

Important: plugin-shipped agents must not rely on unsupported `permissionMode` enforcement. Security enforcement must come from hooks, orchestrator checks, sandboxing, and explicit approval gates.

---

## PRD JSON Contract

Use this contract as the minimum.

```json
{
  "schemaVersion": "superbuilder.prd.v2",
  "project": "string",
  "branchName": "string",
  "targetBranch": "string",
  "integrationBranch": "superbuilder/integration",
  "description": "string",
  "riskLevel": "low | medium | high",
  "deploymentAllowed": false,
  "sourceRefs": {
    "addyosmani/agent-skills": "commit-or-tag",
    "mattpocock/skills": "commit-or-tag",
    "mattpocock/sandcastle": "version-or-commit",
    "snarktank/ralph": "commit-or-tag",
    "karpathy/autoresearch": "commit-or-tag"
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
        "tests": [],
        "security": [],
        "review": [],
        "browser": [],
        "accessibility": [],
        "performance": [],
        "commits": [],
        "diffs": []
      }
    }
  ]
}
```

---

## Orchestrator State Machine

Required loop:

```text
load .superbuilder/prd.json
load .superbuilder/progress.md
validate source refs and policy
select highest-priority failing story
create story branch
create Sandcastle sandbox
run context-cartographer if needed
run implementer
run tests and gates
run reviewer/security/test-engineer fan-out
if failure:
  diagnose
  write failure evidence
  retry within cap
if pass:
  write evidence
  mark story passes=true
  merge story branch into superbuilder/integration
continue until done or blocked
produce final report
stop before production deployment
```

Iteration caps:

| Scope | Default cap |
|---|---:|
| Attempts per story | 3 |
| Repair loops per attempt | 2 |
| Full run stories | User-configurable |
| Self-heal experiments | 3 per repeated failure class |

The system must stop and report when caps are reached. Do not loop forever.

---

## Sandcastle Execution Pattern

Use this shape conceptually:

```ts
await using sandbox = await createSandbox({
  branch: `superbuilder/${story.id}-${slug}`,
  sandbox: selectedProvider,
  hooks: {
    sandbox: {
      onSandboxReady: [{ command: detectedInstallCommand }]
    }
  }
});

await sandbox.run({
  name: `implement-${story.id}`,
  agent: selectedImplementerAgent,
  promptFile: `.superbuilder/prompts/${story.id}-implement.md`,
  maxIterations: 1
});

await sandbox.run({
  name: `verify-${story.id}`,
  agent: selectedTestAgent,
  promptFile: `.superbuilder/prompts/${story.id}-verify.md`,
  maxIterations: 1
});

await sandbox.run({
  name: `review-${story.id}`,
  agent: selectedReviewAgent,
  promptFile: `.superbuilder/prompts/${story.id}-review.md`,
  maxIterations: 1
});
```

This is illustrative, not final code. Validate against the current Sandcastle API before implementation.

Rules:

1. Use `createSandbox()` for multi-pass story work.
2. Use one story branch per story.
3. Preserve logs.
4. Preserve diffs.
5. Preserve commits.
6. Use detected package manager commands.
7. Never use `noSandbox()` for autonomous story execution.
8. Never merge story branch to target branch directly.

---

## Safety Hooks

Implement hooks that block or escalate unsafe behavior.

### Must block by default

```text
rm -rf /
rm -rf .
git reset --hard
git clean -fd
git push --force
git push --mirror
npm publish
pnpm publish
yarn publish
bun publish
vercel deploy --prod
railway up
fly deploy
supabase db reset
dropdb
kubectl delete
terraform destroy
reading or committing .env
committing private keys
committing tokens
editing production config
disabling tests
disabling hooks
disabling security scans
permission bypass flags
```

### Must require explicit approval

```text
new production dependency
auth changes
payment/billing changes
PII/data model changes
migration execution
secret rotation
production config change
public API contract change
quality gate modification
release/deploy action
```

Hook strategy:

| Event | Use |
|---|---|
| `PreToolUse` | Block dangerous commands before execution. |
| `PermissionRequest` | Escalate high-risk actions to user approval. |
| `PostToolUse` | Capture command/test/evidence output. |
| `PostToolUseFailure` | Record failure and trigger diagnosis. |
| `TaskCompleted` | Reject fake completion if evidence missing. |
| `SubagentStart` / `SubagentStop` | Track agent runs. |
| `SessionEnd` | Write final state report. |
| `ConfigChange` | Detect attempts to weaken policy. |
| `WorktreeCreate` / `WorktreeRemove` | Validate isolated execution boundaries. |

---

## Quality Gates

Every relevant story must pass the relevant subset of:

1. Typecheck.
2. Unit tests.
3. Integration tests.
4. Lint.
5. Format.
6. Security scan.
7. Secret scan.
8. Dependency audit.
9. License check for new dependencies.
10. Browser verification for UI.
11. Accessibility verification for UI.
12. Performance check when performance is relevant.
13. API contract verification for API changes.
14. Migration dry run for database changes.
15. Reviewer approval.
16. Security-auditor approval for risk-bearing stories.
17. ADR update for architectural decisions.
18. Documentation update for behavior/API changes.

Default rule:

```text
If a gate is relevant and not run, the story cannot pass.
```

---

## Source Update Workflow

Because upstream skill repos change, Superbuilder must include a source update process.

Command:

```text
/superbuilder:supersources
```

Required workflow:

```text
read source-lock.json
fetch upstream metadata
compare pinned ref vs latest ref
classify changed files
identify added/removed/modified skills
map changes to Superbuilder skills/agents/hooks
classify impact: capability | behavior | security | breaking | irrelevant
run regression evals
propose update patch
require approval for security or behavior changes
update source-lock.json
write update report
```

Create:

```text
.superbuilder/source-lock.json
```

Minimum shape:

```json
{
  "sources": {
    "addyosmani/agent-skills": {
      "ref": "commit-or-tag",
      "lastChecked": "2026-05-05",
      "mappedComponents": ["skills", "agents", "commands", "references"]
    },
    "mattpocock/skills": {
      "ref": "commit-or-tag",
      "lastChecked": "2026-05-05",
      "mappedComponents": ["skills"]
    },
    "mattpocock/sandcastle": {
      "ref": "version-or-commit",
      "lastChecked": "2026-05-05",
      "mappedComponents": ["runtime"]
    },
    "snarktank/ralph": {
      "ref": "commit-or-tag",
      "lastChecked": "2026-05-05",
      "mappedComponents": ["state-machine", "prd-schema"]
    },
    "karpathy/autoresearch": {
      "ref": "commit-or-tag",
      "lastChecked": "2026-05-05",
      "mappedComponents": ["self-improvement-method"]
    }
  }
}
```

Rules:

1. Do not silently absorb upstream prompt changes.
2. Do not update security-sensitive behavior without regression evals.
3. Do not replace local hardened policy with upstream defaults.
4. Pin by tag or commit where possible.
5. Record provenance inside update reports.
6. Treat third-party skills as untrusted until audited.

---

## Self-Healing Protocol

A self-heal run is valid only when it has all of this:

```text
problem statement
baseline metric
editable surface
single mutation
fixed eval task set
score before
score after
keep/revert decision
safety regression result
experiment log
```

Metrics:

| Metric | Meaning |
|---|---|
| story pass rate | Percent of stories completed with all gates. |
| false pass rate | Stories marked complete despite missing evidence. Must be zero. |
| average retries | How many retries are needed per story. |
| diagnosis quality | Failure note identifies cause and next action. |
| security-block success rate | Unsafe operations are blocked. |
| regression count | New failures introduced. |
| token/runtime cost | Overhead introduced by improvement. |
| source-grounding rate | Framework/library claims backed by source docs. |
| context sufficiency | Whether agents had enough project context without dumping the whole repo. |

Keep rule:

```text
Keep a self-heal mutation only if it improves the target metric and does not regress safety, correctness, or evidence quality.
```

Revert rule:

```text
Revert if improvement is unmeasured, ambiguous, unsafe, or only cosmetically better.
```

---

## Before Implementation Checklist

Before writing production code, produce:

1. Current source audit summary.
2. Capability map.
3. Added/removed/changed upstream skill notes.
4. Keep / merge / adapt / discard table.
5. Threat model.
6. Plugin file tree.
7. PRD schema.
8. Story execution state machine.
9. Sandcastle provider plan.
10. Package manager detection plan.
11. Quality gate list.
12. Hook policy.
13. Source update policy.
14. Self-healing metric design.
15. Test plan.
16. Rollback plan.

Do not write implementation code until these artifacts exist and planning approval is obtained.

---

## During Implementation Checklist

During implementation:

1. Commit in small slices.
2. Keep target branch clean.
3. Use `superbuilder/integration` for accumulated work.
4. Use one story branch per story.
5. Keep all autonomous coding inside Sandcastle.
6. Keep hooks active from the beginning.
7. Run tests after each story.
8. Capture evidence after each gate.
9. Update `.superbuilder/progress.md`.
10. Update ADRs for architecture decisions.
11. Track failed attempts.
12. Detect package manager instead of hardcoding.
13. Keep agent prompts scoped.
14. Do not silently add dependencies.
15. Do not ask the user for repeated approvals during normal low-risk implementation.
16. Escalate only high-risk actions.
17. Stop after repeated failure and report honestly.

---

## After Implementation Checklist

After implementation:

1. Run plugin validation.
2. Install plugin locally.
3. Confirm skills auto-discover.
4. Confirm commands work.
5. Confirm agents register.
6. Confirm hooks block dangerous commands.
7. Confirm plugin `bin/` executables are callable.
8. Confirm source update command works.
9. Confirm Sandcastle executes in isolated sandbox.
10. Confirm `noSandbox()` is not used for autonomous execution.
11. Confirm `.superbuilder/prd.json` is created and updated.
12. Confirm failed stories are not marked passed.
13. Confirm self-heal keeps/reverts correctly.
14. Confirm security policy cannot be weakened silently.
15. Confirm production deploy is blocked without approval.
16. Confirm final report includes evidence and limitations.
17. Confirm uninstall/rollback path exists.

---

## Reverification Process

Run this before declaring success.

### Step 1 — Static Plugin Verification

Check:

- `.claude-plugin/plugin.json` is valid.
- Plugin root has `skills/`, `agents/`, `commands/`, `hooks/`, `bin/`.
- Every skill has `SKILL.md`.
- Every command is registered.
- Every agent has narrow role and valid frontmatter.
- No plugin agent relies on unsupported permission enforcement.
- Hooks load.
- `bin` executables run.
- TypeScript builds.
- README exists.
- Security docs exist.
- Source-lock file exists.

### Step 2 — Source Update Verification

Run:

```text
/superbuilder:supersources
```

Expected:

1. It detects pinned source refs.
2. It checks upstream state.
3. It classifies source changes.
4. It does not auto-accept behavior/security changes.
5. It produces an update report.
6. It recommends regression evals.

### Step 3 — Security Verification

Attempt these in a safe test repo:

```bash
rm -rf test-dir
git reset --hard
git clean -fd
git push --force
npm publish
pnpm publish
yarn publish
bun publish
vercel deploy --prod
railway up
fly deploy
supabase db reset
dropdb test
cat .env
git add .env
terraform destroy
kubectl delete namespace production
```

Expected result:

- Blocked outright, or
- Requires explicit human approval, or
- Refused with a clear reason.

The plugin fails if any dangerous action executes silently.

### Step 4 — Functional Verification

Run `/superbuilder:superbuild` on a tiny sample app.

Test input:

```text
Build a simple task tracker where users can add, complete, edit, and delete tasks.
```

Expected behavior:

1. It clarifies scope.
2. It challenges weak assumptions.
3. It audits project context.
4. It produces a PRD.
5. It creates `.superbuilder/prd.json`.
6. It asks for planning approval.
7. It implements one story in sandbox.
8. It runs gates.
9. It logs progress.
10. It marks only verified stories as passed.
11. It prepares a final PR report.
12. It stops before deployment.

### Step 5 — Failure Verification

Create a forced failing test.

Expected behavior:

1. Story is not marked passed.
2. Failure is diagnosed.
3. Retry plan is created.
4. Progress log records failure.
5. Evidence folder stores failed test output.
6. Final report includes unresolved risk if failure remains.

### Step 6 — Self-Healing Verification

Create a repeated harmless failure pattern.

Expected behavior:

1. Self-heal identifies the pattern.
2. It proposes exactly one improvement.
3. It applies the improvement in sandbox.
4. It runs fixed eval tasks.
5. It compares against baseline.
6. It keeps only measured improvement.
7. It reverts weak, unsafe, or unmeasured changes.
8. It logs the experiment.

### Step 7 — Capability Preservation Verification

Confirm the final plugin preserves:

- Matt-style grilling and domain clarification.
- Matt-style issue slicing, triage, zoom-out, diagnosis, and architecture improvement.
- Addy-style SDLC gates, source grounding, context engineering, security, review, simplification, performance, documentation, and ship readiness.
- Ralph-style PRD/story/progress loop.
- Sandcastle-style sandboxed execution and commit capture.
- Autoresearch-style measured improvement.
- Source-update auditing for upstream skill changes.

### Step 8 — Final Acceptance Report

Produce a report containing:

1. What was built.
2. What source versions were used.
3. What changed from the previous Superbuilder design.
4. What was imported.
5. What was adapted.
6. What was rejected.
7. What was merged.
8. What was kept separate.
9. Security guarantees.
10. Remaining risks.
11. Test evidence.
12. Reverification evidence.
13. Source update evidence.
14. Human approval instructions.
15. Final deploy warning.

---

## What To Avoid

Do not:

1. Create one mega-skill.
2. Duplicate Addy and Matt skills verbatim.
3. Use Ralph shell behavior as the secure runtime core.
4. Use unsafe permission bypass flags.
5. Use Sandcastle `noSandbox()` for autonomous execution.
6. Let agents execute on `main`.
7. Let self-healing weaken safety policy.
8. Treat unit tests as full verification.
9. Skip browser verification for UI work.
10. Hardcode package manager commands.
11. Silently install dependencies.
12. Commit secrets or `.env` files.
13. Auto-merge to target branch.
14. Auto-deploy.
15. Mark stories complete without evidence.
16. Ask the user for repeated approvals during normal low-risk implementation.
17. Hide failed experiments.
18. Optimize autonomy at the cost of reversibility.
19. Overbuild a distributed swarm before the local plugin loop works.
20. Invent capabilities that Claude Code plugins, Sandcastle, or the source repos do not support.
21. Claim success without running reverification.
22. Silently absorb upstream skill changes without audit.

---

## Definition Of Done

Superbuilder is done only when:

1. It installs as one Claude Code plugin.
2. It exposes coherent skills, commands, agents, hooks, and executables.
3. `/superbuilder:superbuild` converts a rough idea into a PRD.
4. The PRD becomes `.superbuilder/prd.json` stories.
5. Stories run through Sandcastle sandbox execution.
6. Each story produces evidence.
7. Failed stories are not marked complete.
8. Review/security/test fan-out works.
9. Source updates can be audited.
10. Self-healing works through measured experiments.
11. Security hooks block dangerous behavior.
12. Final output is PR-ready.
13. Production deployment still requires explicit human approval.

Anything less is not done.

---

## Required First Output From The Implementing Agent

Before writing implementation code, output:

1. Concise implementation plan.
2. Current source audit summary.
3. Current upstream change notes.
4. Capability map.
5. Keep / merge / adapt / discard table.
6. Proposed file tree.
7. Security model.
8. Sandcastle runtime plan.
9. Source update plan.
10. Self-healing eval plan.
11. Reverification plan.
12. Main risks.
13. Assumptions requiring validation.

Then ask for planning approval before writing implementation code.

---

## Hard Constraints

You must not:

- Invent repository capabilities.
- Skip current source audit.
- Claim implementation success without tests.
- Use unsafe permission bypasses.
- Use direct production deployment.
- Treat self-improvement as magic.
- Merge unverified code.
- Hide uncertainty.
- Continue after repeated failure without diagnosis.
- Make the human babysit every small step.
- Silently update bundled skill behavior from upstream.

You must:

- Be proactive.
- Be skeptical.
- Be secure by default.
- Be evidence-driven.
- Use small reversible changes.
- Preserve user intent.
- Push back on bad ideas.
- Keep source provenance.
- Run reverification.
- Produce working software, not theater.
