// Single source of truth for the gate-runner allow-list.
// Both gates.ts (run-time refusal) and validate.ts (PRD-validate-time refusal)
// import from here. See docs/SECURITY.md "Gate runner allow-list".

export const ALLOWED_PROGRAMS = new Set<string>([
  "npm", "pnpm", "yarn", "bun", "npx", "pnpx", "bunx", "deno",
  "node", "tsc", "tsx", "vitest", "jest", "playwright",
  "pytest", "uv", "poetry", "ruff", "black", "mypy", "pyright",
  "cargo", "rustfmt", "clippy",
  "go", "gofmt", "golangci-lint",
  "bundle", "rspec", "rubocop",
  "composer", "phpunit", "phpstan",
  "eslint", "prettier", "stylelint", "biome",
  "axe", "lighthouse", "trivy", "semgrep", "bandit",
  "shellcheck", "shfmt",
  "make",
]);

export const FORBIDDEN_TOKENS = /[;&|<>`$()]|--?\s|\\n/;
