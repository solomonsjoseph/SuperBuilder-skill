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
  "axe", "lighthouse", "pa11y", "trivy", "semgrep", "bandit",
  "shellcheck", "shfmt",
  "make",
]);

// Matches shell metacharacters that would compose commands or substitute
// values. Rejects: `;` `<` `>` backtick `\n` `|` (incl. `||`) `&&` `$(`.
// Single `&` is allowed (some flags use it inside `=` values), single `(` /
// `)` are allowed (only `$(` opens a subshell). Long flags like `--name`,
// `--name=value`, and short flags like `-x`, `-xvf` are intentionally
// allowed — gate commands routinely use them.
export const FORBIDDEN_TOKENS = /[;<>`\n]|\|\|?|&&|\$\(/;
