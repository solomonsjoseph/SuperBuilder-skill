# Superbuilder Plugin — Canvas Prompt

**Last research pass:** 2026-05-05  
**Document type:** Markdown implementation prompt  
**Use case:** Paste this into a capable coding agent / Claude Code session to design and implement the Superbuilder plugin.

---

## Research Basis

This prompt is structured using current prompting guidance from:

- OpenAI prompt guidance: clear instructions first, delimiters, specificity, explicit output formats, and examples.
- Anthropic prompt guidance: clear structure, XML/section-style organization, explicit success criteria, source verification, agentic workflows, git-based progress, and self-checking.
- Claude Code plugin documentation: plugins can package skills, commands, agents, hooks, executables, and persistent plugin data.
- Claude Code hooks documentation: hooks can run at lifecycle points such as `PreToolUse`, `PostToolUse`, `PermissionRequest`, `TaskCreated`, and related events.
- Source repositories:
  - `addyosmani/agent-skills`
  - `mattpocock/skills`
  - `mattpocock/sandcastle`
  - `snarktank/ralph`
  - `karpathy/autoresearch`

Reference URLs:

- https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/hooks
- https://github.com/addyosmani/agent-skills
- https://github.com/mattpocock/skills
- https://github.com/mattpocock/sandcastle
- https://github.com/snarktank/ralph
- https://github.com/karpathy/autoresearch

---

# Prompt

## Role

You are a principal software architect, senior AI-agent engineer, security engineer, and plugin systems designer.

Your task is to design and implement a Claude Code plugin named **Superbuilder**.

You must think like a ruthless production engineer. Do not blindly merge tools. Preserve useful capabilities, remove duplication, enforce security, and design the system so an LLM can take a rough user idea and autonomously drive the project from planning to verified implementation.

You must use these five repositories as source material:

1. https://github.com/addyosmani/agent-skills
2. https://github.com/mattpocock/skills
3. https://github.com/mattpocock/sandcastle
4. https://github.com/snarktank/ralph
5. https://github.com/karpathy/autoresearch

---

## What This Is

**Superbuilder** is one bundled Claude Code plugin that turns an existing LLM into a proactive software-engineering operator.

It is not a pile of copied prompts.

It is not one giant mega-skill.

It is a coordinated plugin containing:

- Skills
- Agents
- Slash commands
- Safety hooks
- A TypeScript orchestrator
- A sandbox execution layer
- A PRD/story scheduler
- A measurable self-improvement loop

The goal is to let the user dump an idea once, approve a plan once, and then let the LLM handle implementation, testing, documentation, review, and PR preparation inside controlled safety boundaries.

The human should mainly be present at:

1. **Planning approval**
2. **Final release / production approval**

The system must not silently deploy production-impacting changes.

---

## Purpose

Build a plugin that gives an LLM the behavior of a strong software architect, staff engineer, test engineer, security auditor, reviewer, and autonomous implementation manager.

The plugin must:

1. Force alignment with the user’s real intent.
2. Challenge vague, weak, risky, or overcomplicated ideas.
3. Convert the idea into a PRD.
4. Convert the PRD into small, executable user stories.
5. Run implementation in isolated sandboxes.
6. Use agent specialization instead of one overloaded agent.
7. Verify every story with tests, review, security checks, and evidence.
8. Retry or diagnose failed stories instead of pretending they passed.
9. Self-improve only through measured experiments.
10. Stop before production deployment until explicit human approval.

---

## Desired Outcome

When `/superbuilder:superbuild` is run, the flow must be:

```text
idea dump
→ clarification / grilling
→ PRD
→ prd.json stories
→ human planning approval
→ sandboxed implementation swarm
→ tests / security / review gates
→ failed-story diagnosis and retry
→ measured self-healing where useful
→ final PR-ready report
→ human final approval
→ optional release/deploy step
```

The system is successful only if it produces:

1. A clear PRD from a rough idea.
2. A machine-readable story plan.
3. Isolated implementation branches or worktrees.
4. Evidence for each completed story.
5. Failed story logs.
6. Security review output.
7. Test output.
8. Documentation / ADR updates where needed.
9. A final PR summary.
10. Explicit warning that production deployment still requires human approval.

No evidence = no pass.  
No pass = no merge.  
No explicit production approval = no deploy.

---

## Selected Architecture

Use this architecture unless implementation evidence proves a better variant:

```text
Matt Pocock skills
= idea alignment, grilling, domain language, diagnosis, architecture improvement

Addy Osmani agent-skills
= SDLC discipline, spec, plan, build, verify, review, ship gates

Ralph
= PRD-to-user-story state machine and autonomous iteration pattern

Sandcastle
= only execution engine for sandboxed coding agents

Karpathy Autoresearch
= measured self-improvement loop, not directly imported app code
```

Final formula:

```text
Matt alignment
+ Addy SDLC gates
+ Ralph-inspired story scheduler
+ Sandcastle sandbox executor
+ Autoresearch-style measured self-improvement
= Superbuilder
```

---

## Why This Combination

This is the best balanced combination because each source owns a different layer:

| Source | Role in Superbuilder | Keep / Adapt / Avoid |
|---|---|---|
| `mattpocock/skills` | Alignment, grilling, diagnosis, architecture thinking | Keep targeted skills; merge overlap with Addy where duplicated |
| `addyosmani/agent-skills` | Production SDLC, review, testing, security, shipping discipline | Use as canonical engineering lifecycle |
| `snarktank/ralph` | Autonomous PRD/story/progress loop | Adapt the pattern; do not rely on unsafe raw shell behavior |
| `mattpocock/sandcastle` | Sandboxed execution of coding agents | Keep as execution engine |
| `karpathy/autoresearch` | Measured self-improvement loop | Adapt the method; do not import wholesale |

Why not other combinations:

| Alternative | Problem |
|---|---|
| Addy + Matt only | Good skills, weak autonomous execution |
| Ralph only | Autonomous, but too risky and under-gated for secure production use |
| Sandcastle only | Good execution, weak product planning and state machine |
| Autoresearch-first | Optimizes experiments, not software delivery |
| One mega-skill | Becomes prompt soup and loses routing clarity |
| Claude plugin with no orchestrator | Too passive; not a real autonomous build loop |

The chosen combination preserves the strongest unique capability from each source without letting any one repo dominate the architecture.

---

## Non-Negotiable Principles

1. Security by default.
2. No production deployment without explicit human approval.
3. No destructive operation without explicit approval.
4. No bypassing tests, linters, security scans, or review gates.
5. No self-improvement that weakens safety.
6. No fake completion.
7. Every story must be small, testable, reversible, and independently reviewable.
8. Every major architectural decision must produce an ADR.
9. All autonomous work must happen in isolated sandbox branches or worktrees.
10. The plugin must work for greenfield projects and existing codebases.
11. The user may get carried away; the system must not.
12. The LLM must push back when the idea is weak, unsafe, vague, or overbuilt.

---

## Plugin Shape

Implement this structure:

```text
superbuilder/
  .claude-plugin/
    plugin.json

  skills/
    sync-idea/
      SKILL.md
    write-prd/
      SKILL.md
    plan-stories/
      SKILL.md
    build-slice/
      SKILL.md
    verify-slice/
      SKILL.md
    review-slice/
      SKILL.md
    improve-architecture/
      SKILL.md
    self-improve/
      SKILL.md

  agents/
    planner.md
    implementer.md
    test-engineer.md
    security-auditor.md
    reviewer.md
    architect.md
    self-improvement-researcher.md

  commands/
    superbuild.md
    superheal.md
    superreview.md
    superstatus.md

  hooks/
    hooks.json

  bin/
    superbuilder
    superbuilder-run
    superbuilder-heal

  orchestrator/
    package.json
    tsconfig.json
    src/
      index.ts
      config.ts
      prd.ts
      scheduler.ts
      story-runner.ts
      sandcastle-runner.ts
      gates.ts
      security.ts
      metrics.ts
      memory.ts
      merge.ts
      self-heal.ts
      report.ts
```

---

## Main Command Behavior

The main command is:

```text
/superbuilder:superbuild
```

It must run this flow:

1. Ingest the user’s rough idea.
2. Ask only essential clarification questions.
3. Challenge weak assumptions.
4. Identify product, technical, security, and operational risks.
5. Produce an implementation plan.
6. Produce a PRD.
7. Produce `prd.json`.
8. Ask for planning approval.
9. After approval, run autonomous implementation.
10. Implement one story per iteration.
11. Run gates after each story.
12. Retry failed stories with diagnosis.
13. Use self-healing only after repeated failure patterns.
14. Produce final PR-ready report.
15. Stop before production deployment.
16. Ask for final human release approval.

The system should be proactive, but not reckless.

---

## PRD JSON Contract

Use this as the minimum machine-readable contract:

```json
{
  "project": "string",
  "branchName": "string",
  "description": "string",
  "riskLevel": "low | medium | high",
  "deploymentAllowed": false,
  "humanApprovalRequiredFor": [
    "production deploy",
    "destructive commands",
    "secrets changes",
    "billing changes",
    "auth changes",
    "database destructive migrations"
  ],
  "qualityGates": {
    "typecheck": "string",
    "lint": "string",
    "test": "string",
    "security": "string",
    "secretScan": "string",
    "browser": "string | null"
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
      "passes": false,
      "evidence": {
        "tests": [],
        "security": [],
        "review": [],
        "browser": [],
        "commits": []
      }
    }
  ]
}
```

---

## Agent Responsibilities

### `planner`

- Converts rough user ideas into PRDs, milestones, and user stories.
- Challenges vague or dangerous requirements.
- Produces `prd.json`.

### `implementer`

- Builds one vertical slice at a time.
- Works only inside a sandbox branch or worktree.
- Does not deploy.

### `test-engineer`

- Writes and runs tests.
- Rejects shallow assertions.
- Confirms acceptance criteria through executable evidence.

### `security-auditor`

- Threat-models each risky change.
- Checks auth, secrets, injection, supply chain, permissions, unsafe shell behavior, data exposure, and production-impacting operations.

### `reviewer`

- Reviews correctness, simplicity, maintainability, architecture fit, and acceptance criteria compliance.

### `architect`

- Produces ADRs.
- Detects overengineering, bad abstractions, unsafe coupling, and long-term maintainability risks.

### `self-improvement-researcher`

- Runs measured workflow experiments.
- Keeps only improvements backed by objective evidence.
- Cannot weaken safety gates.

---

## Implementation Phases

### Phase 0 — Repository Audit

Before coding, read all five source repositories.

Produce a decision table:

| Item | Decision | Reason |
|---|---|---|
| Skill / concept / script | Keep / Merge / Adapt / Discard | Why |

Required outputs:

1. Source audit summary.
2. Capability map.
3. Overlap map.
4. Keep / merge / adapt / discard table.
5. Risk notes.
6. Implementation assumptions.

Do not write production code until this exists.

---

### Phase 1 — Plugin Skeleton

Create the Claude Code plugin structure.

Tasks:

1. Create `.claude-plugin/plugin.json`.
2. Register skills.
3. Register commands.
4. Register agents.
5. Register hooks.
6. Register `bin` executables.
7. Add README.
8. Add installation instructions.
9. Add configuration docs.
10. Add security model docs.

---

### Phase 2 — Skill Consolidation

Create these skills:

| Skill | Source Basis | Purpose |
|---|---|---|
| `sync-idea` | Matt grilling/domain alignment | Make the user’s vague idea precise |
| `write-prd` | Addy spec discipline + Ralph PRD format | Produce implementation-grade PRD |
| `plan-stories` | Addy planning + Ralph story loop | Create executable story backlog |
| `build-slice` | Addy build/TDD guidance | Implement one story at a time |
| `verify-slice` | Addy verification/security/performance | Prove story completion |
| `review-slice` | Addy review + Matt diagnosis | Review and diagnose diffs |
| `improve-architecture` | Matt architecture skill | Improve structure without overengineering |
| `self-improve` | Autoresearch pattern | Improve workflow using measured experiments |

Rules:

1. Do not copy duplicate skills blindly.
2. Merge overlapping guidance.
3. Preserve unique strengths.
4. Make each skill narrow and discoverable.
5. Every skill must have clear triggers and outputs.

---

### Phase 3 — Orchestrator

Implement a TypeScript orchestrator.

Required loop:

```text
while stories remain and iteration cap not reached:
  read prd.json
  select highest-priority failing story
  create sandbox branch/worktree
  run implementer through Sandcastle
  run typecheck/lint/tests/security/review/browser gates
  collect evidence
  mark story passed only if all required gates pass
  append progress log
  merge only when safe
```

Rules:

1. All implementation must go through Sandcastle.
2. Never edit `main` directly.
3. Never mark a story complete without evidence.
4. Never continue blindly after repeated failure.
5. Failed stories must include diagnosis notes.

---

### Phase 4 — Sandcastle Integration

Use Sandcastle as the only execution engine.

Requirements:

1. Docker provider first.
2. Podman optional.
3. Vercel sandbox optional.
4. Provider config through plugin settings.
5. One branch/worktree per story.
6. Capture commits, diffs, logs, test output, and review output.
7. Merge only after gates pass.
8. Preserve rollback path.

---

### Phase 5 — Safety Hooks

Implement hooks that block or require approval for unsafe behavior.

Block or gate:

- `rm -rf`
- `git reset --hard`
- `git clean -fd`
- force push
- deploy commands
- package publishing
- database drops
- production migration execution
- reading or committing `.env`
- committing private keys or tokens
- editing production config
- disabling tests
- disabling security gates
- unsafe permission bypass flags
- autonomous release actions

Minimum hook strategy:

1. `PreToolUse` blocks dangerous commands.
2. `PermissionRequest` escalates high-risk actions to user approval.
3. `PostToolUse` captures evidence.
4. `TaskCompleted` rejects fake completion.
5. `SessionEnd` writes a final state report.

---

### Phase 6 — Quality Gates

Every story must pass the relevant subset of:

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
11. Accessibility check for UI.
12. Performance check when relevant.
13. Reviewer-agent approval.
14. ADR update when architecture changes.
15. Documentation update when behavior changes.

Default rule:

```text
If a gate is relevant and not run, the story cannot pass.
```

---

### Phase 7 — Self-Healing

Implement an Autoresearch-style self-improvement loop.

The loop:

```text
observe repeated weakness
→ propose one improvement
→ apply in sandbox
→ run fixed benchmark tasks
→ compare against baseline
→ keep only if objective metric improves
→ revert otherwise
→ log the result
```

Self-healing may improve:

- Prompt wording.
- Story splitting.
- Agent routing.
- Gate ordering.
- Retry policy.
- Context packing.
- Review checklist.
- Test generation strategy.
- Documentation quality.
- Failure diagnosis.

Self-healing must never:

- Remove security gates.
- Reduce test requirements.
- Bypass approval.
- Auto-deploy.
- Ignore failed checks.
- Hide logs.
- Edit plugin core without tests.
- Keep a change without measurement.

Required metrics:

| Metric | Meaning |
|---|---|
| story pass rate | Percent of stories completed with all gates |
| false pass rate | Stories marked complete despite missing evidence |
| average retries | How many retries needed per story |
| gate failure diagnosis quality | Whether failure notes identify cause and next action |
| security-block success rate | Whether unsafe commands are blocked |
| regression count | New failures introduced by improvement |
| token/runtime cost | Whether improvement adds unacceptable overhead |

---

## What To Avoid

Avoid these mistakes:

1. Do not create one giant `SKILL.md`.
2. Do not duplicate Addy and Matt skills verbatim when they overlap.
3. Do not let Ralph run with dangerous permission bypasses.
4. Do not use Ralph’s shell loop as the secure core.
5. Do not import Autoresearch directly as product code.
6. Do not let agents execute on `main`.
7. Do not let self-healing weaken safety policy.
8. Do not treat unit tests as full verification.
9. Do not skip browser verification for UI work.
10. Do not silently install dependencies.
11. Do not commit secrets or `.env` files.
12. Do not auto-merge to main.
13. Do not auto-deploy.
14. Do not mark stories complete without evidence.
15. Do not ask the user for repeated approvals during normal implementation.
16. Do not hide failed experiments.
17. Do not optimize autonomy at the cost of reversibility.
18. Do not overbuild a distributed system before the local plugin loop works.
19. Do not invent capabilities that the underlying plugin/runtime cannot support.
20. Do not claim success without running reverification.

---

## Before Implementation Checklist

Produce these artifacts first:

1. Source audit summary.
2. Capability map.
3. Keep / merge / adapt / discard table.
4. Threat model.
5. Plugin file tree.
6. PRD schema.
7. Story execution state machine.
8. Quality gate list.
9. Hook policy.
10. Self-healing metric design.
11. Test plan.
12. Rollback plan.

Implementation cannot start until these are present.

---

## During Implementation Checklist

During implementation:

1. Commit in small slices.
2. Keep `main` clean.
3. Run tests after each story.
4. Update progress log.
5. Update ADRs for architectural decisions.
6. Track failed attempts.
7. Keep security hooks active from the beginning.
8. Use sandbox branches for agent work.
9. Record evidence for every pass.
10. Prefer simple working architecture over clever abstractions.
11. Keep plugin commands deterministic.
12. Keep all agent prompts scoped.
13. Keep runtime config explicit.
14. Keep logs readable enough for human review.

---

## After Implementation Checklist

After implementation:

1. Run full plugin validation.
2. Install plugin locally.
3. Confirm skills auto-discover.
4. Confirm commands work.
5. Confirm agents register.
6. Confirm hooks block dangerous commands.
7. Confirm Sandcastle executes in isolated sandbox.
8. Confirm PRD-to-story loop works.
9. Confirm failed story retries correctly.
10. Confirm self-heal can run a harmless benchmark and keep/revert correctly.
11. Confirm no unsafe permission bypass is used.
12. Confirm final report includes evidence.
13. Confirm production deploy is blocked without approval.
14. Confirm README explains limitations.
15. Confirm uninstall/rollback path exists.

---

## Reverification Process

Run this before declaring success.

### Step 1 — Static Verification

Check:

- `plugin.json` is valid.
- Required directories exist.
- Every skill has `SKILL.md`.
- Every command is registered.
- Every agent has a narrow role.
- Hooks load.
- `bin` executables run.
- TypeScript builds.
- README exists.
- Security policy exists.

### Step 2 — Security Verification

Attempt these commands in a safe test repo:

```bash
rm -rf test-dir
git reset --hard
git clean -fd
git push --force
npm publish
pnpm publish
yarn publish
vercel deploy --prod
railway up
fly deploy
supabase db reset
dropdb test
cat .env
git add .env
```

Expected result:

- Blocked outright, or
- Requires explicit human approval, or
- Refused with a clear reason.

The plugin fails if any dangerous action executes silently.

### Step 3 — Functional Verification

Run `/superbuilder:superbuild` on a tiny sample app.

Test input:

```text
Build a simple task tracker where users can add, complete, edit, and delete tasks.
```

Expected behavior:

1. The system clarifies scope.
2. It produces a PRD.
3. It creates `prd.json`.
4. It asks for planning approval.
5. It implements one story in sandbox.
6. It runs gates.
7. It logs progress.
8. It marks only verified stories as passed.
9. It prepares a final PR report.
10. It stops before deployment.

### Step 4 — Failure Verification

Create a story with a forced failing test.

Expected behavior:

1. The story is not marked passed.
2. Failure is diagnosed.
3. Retry plan is created.
4. Progress log records failure.
5. Final report includes unresolved risk if it remains failing.

### Step 5 — Self-Healing Verification

Create a repeated harmless failure pattern.

Expected behavior:

1. Self-heal identifies the pattern.
2. It proposes exactly one improvement.
3. It applies the improvement in a sandbox.
4. It runs a fixed benchmark.
5. It compares against baseline.
6. It keeps only a measured improvement.
7. It reverts weak, unsafe, or unmeasured changes.
8. It logs the experiment.

### Step 6 — Capability Preservation Verification

Confirm the final plugin preserves:

- Matt-style alignment and domain clarification.
- Addy-style SDLC quality gates.
- Ralph-style autonomous PRD/story loop.
- Sandcastle-style sandboxed execution.
- Autoresearch-style measured improvement.

### Step 7 — Final Acceptance Report

Produce a report containing:

1. What was built.
2. What was intentionally not imported.
3. What was merged.
4. What was kept separate.
5. What was removed.
6. Security guarantees.
7. Remaining risks.
8. Test evidence.
9. Reverification evidence.
10. Human approval instructions.
11. Final deploy warning.

---

## Definition of Done

The plugin is done only when:

1. A user can install it as one Claude Code plugin.
2. The main command can take a rough idea and produce a PRD.
3. The PRD can be converted into executable stories.
4. Stories run through sandboxed implementation.
5. Quality gates produce evidence.
6. Failed stories are not marked complete.
7. Self-healing works through measured experiments.
8. Security hooks block dangerous behavior.
9. Final output is PR-ready.
10. Production deploy still requires explicit human approval.

Anything less is not done.

---

## Required First Output From The Implementing Agent

Before writing implementation code, output:

1. Concise implementation plan.
2. Source audit summary.
3. Capability map.
4. Keep / merge / adapt / discard table.
5. Proposed file tree.
6. Security model.
7. Reverification plan.
8. Main risks.
9. Assumptions that need validation.

Then ask for planning approval before writing implementation code.

---

## Hard Constraints

You must not:

- Invent repository capabilities.
- Skip source audit.
- Claim implementation success without tests.
- Use unsafe permission bypasses.
- Use direct production deployment.
- Treat self-improvement as magic.
- Merge unverified code.
- Hide uncertainty.
- Continue after repeated failure without diagnosis.
- Make the human babysit every small step.

You must:

- Be proactive.
- Be skeptical.
- Be secure by default.
- Be evidence-driven.
- Use small reversible changes.
- Preserve user intent.
- Push back on bad ideas.
- Produce working software, not theater.
