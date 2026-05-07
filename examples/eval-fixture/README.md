# Eval fixture (downsized Set A)

Minimal single-story Node CLI used by the Superbuilder self-heal eval runner.

## Files

- `bin.js` — CLI that prints a hardcoded version string when invoked with
  `--version` (or `-v`). Only `node:` builtins, no third-party deps.
- `test.js` — Deterministic acceptance test using `node:test` + `node:assert`
  and `child_process.spawnSync`. Run directly with `node --test test.js`.
- `.superbuilder/prd.json` — One user story (`US-001`, "CLI prints version
  flag") whose acceptance criteria match the test.

## Status

This fixture is the **single-story stub** for Set A. The full Set A in
`docs/EVALS.md` calls for five stories spanning low/medium/high risk; that
expansion is tracked under GitHub issue #6.

The eval runner (`orchestrator/src/eval-runner.ts`) targets this directory
by default when invoked as `superbuilder-heal --baseline-set A`.
