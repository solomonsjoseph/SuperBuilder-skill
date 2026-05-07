---
description: Audit the target project before autonomous work — stack, tests, package manager, risks, CI/CD, deployment surfaces, missing guardrails.
argument-hint: [optional path; default cwd]
allowed-tools: Read, Glob, Grep, Bash, Task
---

You are running a pre-flight audit of the target project. Path: ${ARGUMENTS:-$CLAUDE_PROJECT_DIR}.

Run these in parallel where possible (single message, multiple tool calls):

1. **Stack detection** — read `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `Gemfile`, plus framework signals (next.config.*, vite.config.*, django settings, fastapi entrypoints).
2. **Package manager** — check lockfiles in this priority: `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json` → `bun.lockb`/`bun.lock` → `poetry.lock` → `uv.lock` → `Cargo.lock` → `go.mod`. Record the detected manager.
3. **Test surface** — find test directories (`__tests__`, `tests/`, `test/`, `spec/`), test runners, coverage configs. Note whether tests currently pass (do NOT run them — too expensive; just look at CI status badges, recent commits, README claims).
4. **CI/CD** — list `.github/workflows/`, `.gitlab-ci.yml`, `circleci/`, `.buildkite/`, `vercel.json`, `netlify.toml`, `fly.toml`, `railway.toml`, `Dockerfile`, `docker-compose.*`, k8s manifests.
5. **Deployment surfaces** — anything callable in production: hosting target, public API endpoints, database migrations, payment integrations, auth providers.
6. **Risk register** — secrets in repo, exposed `.env*` files, hardcoded credentials, weak auth, missing secret scanning, unpinned dependencies, missing pre-commit hooks.
7. **Existing docs** — `README.md`, `CONTEXT.md`, `docs/adr/`, `ARCHITECTURE.md`, `SECURITY.md`. Quote key facts; do not reinvent them.
8. **Existing guardrails** — pre-commit, husky, lefthook, lint-staged, branch protection rules visible in CI configs.

## Output format

```
# Superbuilder audit — <project-name>

## Stack
- Language(s):
- Framework(s):
- Package manager:
- Build/test commands:

## Tests & quality gates
- Test runner:
- Coverage:
- Lint/format:
- Type check:

## CI/CD & deployment
- Pipelines:
- Deploy targets:
- Production-impacting surfaces:

## Risks (high → low)
- ...

## Existing docs to honor
- ...

## Missing guardrails (recommended additions)
- ...

## Recommended next step
- ...
```

Be concrete and quote file paths. Do not invent capabilities the project does not have.
