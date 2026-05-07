// Stack-aware default qualityGates templates.
//
// Given a detected stack (package manager + framework + UI flag), produce a
// partial QualityGates object whose every command passes validateGateCommand.
// Callers (e.g. context-sync) merge this with user overrides before writing
// .superbuilder/context/gates.json.
//
// All commands here MUST:
//   1. start with a token in ALLOWED_PROGRAMS (see allow-list.ts)
//   2. contain no shell metacharacters rejected by FORBIDDEN_TOKENS in
//      allow-list.ts (the single source of truth for both PRD-validate and
//      runShell): ;  <  >  `  newline  |  ||  &&  $(
//   3. flags like `--name`, `--name=value`, `-x`, `-xvf` are allowed.
//
// Command shapes were verified against upstream docs:
//   - axe       <url>                              (npmjs.com/package/@axe-core/cli)
//   - pa11y     <url>                              (github.com/pa11y/pa11y)
//   - lighthouse <url> --output=json               (github.com/GoogleChrome/lighthouse)
//   - playwright test                              (playwright.dev/docs/running-tests)
//   - ruff check / ruff format --check             (docs.astral.sh/ruff)
//   - bandit -r .                                  (bandit.readthedocs.io)
//   - cargo check / cargo test / cargo clippy /
//     cargo fmt --check                            (doc.rust-lang.org/cargo)
//   - golangci-lint run / go test ./... / gofmt -l . (golangci-lint.run, go.dev)

import type { QualityGates } from "./types.js";

export interface StackInfo {
  packageManager:
    | "pnpm"
    | "yarn"
    | "npm"
    | "bun"
    | "poetry"
    | "uv"
    | "cargo"
    | "go"
    | "bundler"
    | "composer"
    | "unknown";
  framework?: "next" | "vite" | "django" | "fastapi" | "rails" | "none" | null;
  hasUI?: boolean;
}

// Map a Node package manager to its `<pm> test` invocation. pnpm/yarn/bun all
// accept a bare `test` script alias just like npm.
function nodeTestCommand(pm: StackInfo["packageManager"]): string {
  switch (pm) {
    case "pnpm": return "pnpm test";
    case "yarn": return "yarn test";
    case "bun":  return "bun test";
    case "npm":
    default:     return "npm test";
  }
}

// Frontend triad: browser/a11y/perf. Only emitted when hasUI === true.
function uiGates(): Pick<QualityGates, "browser" | "accessibility" | "performance"> {
  return {
    browser: "playwright test",
    accessibility: "axe http://localhost:3000",
    performance: "lighthouse http://localhost:3000 --output=json",
  };
}

function nextGates(stack: StackInfo): Partial<QualityGates> {
  return {
    typecheck: "tsc --noEmit",
    test: nodeTestCommand(stack.packageManager),
    lint: "eslint .",
    format: "prettier --check .",
    ...uiGates(),
  };
}

function viteGates(stack: StackInfo): Partial<QualityGates> {
  // Vite scaffolds typically don't define an `npm test` script; default to
  // the standard Vitest runner instead. Users can override.
  void stack;
  return {
    typecheck: "tsc --noEmit",
    test: "vitest run",
    lint: "eslint .",
    format: "prettier --check .",
    ...uiGates(),
  };
}

function nodeLibGates(stack: StackInfo): Partial<QualityGates> {
  return {
    typecheck: "tsc --noEmit",
    test: nodeTestCommand(stack.packageManager),
    lint: "eslint .",
    format: "prettier --check .",
  };
}

function djangoGates(): Partial<QualityGates> {
  return {
    test: "pytest",
    lint: "ruff check",
    format: "ruff format --check",
    security: "bandit -r .",
  };
}

function fastapiGates(): Partial<QualityGates> {
  return {
    test: "pytest",
    integrationTest: "pytest -m integration",
    lint: "ruff check",
    format: "ruff format --check",
    security: "bandit -r .",
  };
}

function rustGates(): Partial<QualityGates> {
  return {
    typecheck: "cargo check",
    test: "cargo test",
    lint: "cargo clippy",
    format: "cargo fmt --check",
  };
}

function goGates(): Partial<QualityGates> {
  return {
    test: "go test ./...",
    lint: "golangci-lint run",
    format: "gofmt -l .",
  };
}

/**
 * Build a partial QualityGates template for the detected stack.
 *
 * Returned commands are starter defaults — every gate still passes through
 * validateGateCommand at PRD-validate time, and the user is asked to confirm
 * or override them before the orchestrator runs.
 */
export function defaultGates(stack: StackInfo): Partial<QualityGates> {
  const fw = stack.framework ?? null;

  // Python stacks first — framework selects the template; pm only affects
  // future install hooks (not gate commands).
  if (stack.packageManager === "poetry" || stack.packageManager === "uv") {
    if (fw === "fastapi") return fastapiGates();
    if (fw === "django") return djangoGates();
    // Generic Python project: ruff + pytest + bandit is a sane default.
    return djangoGates();
  }

  if (stack.packageManager === "cargo") {
    return rustGates();
  }

  if (stack.packageManager === "go") {
    return goGates();
  }

  // Node-family package managers.
  const isNodePm =
    stack.packageManager === "pnpm" ||
    stack.packageManager === "yarn" ||
    stack.packageManager === "npm" ||
    stack.packageManager === "bun";

  if (isNodePm) {
    if (fw === "next") return nextGates(stack);
    if (fw === "vite") return viteGates(stack);
    // Other Node frameworks or CLI/library: typecheck/test/lint/format only.
    // Honour an explicit hasUI flag to opt back into browser/a11y/perf.
    const base = nodeLibGates(stack);
    return stack.hasUI ? { ...base, ...uiGates() } : base;
  }

  // Bundler / composer / unknown: leave everything to the user.
  return {};
}
