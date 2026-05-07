// Tests for the orchestrator's `heal` CLI verb — specifically the
// revert-failure escalation path added for issue #17.
//
// When `git apply -R <patch>` fails, the orchestrator must:
//   - exit with code 2 (distinct from normal 0/1)
//   - emit "DIRTY" on stderr so an operator notices
//   - record decision="revert" and safetyRegression="revert-failed" in the
//     EXP-NNN.json regardless of metric outcome
//
// We reproduce the failure deterministically via a `git` shim on PATH:
// real `git apply` and `git apply --check` succeed (so the heal verb gets
// past pre-flight and applies the mutation), but `git apply -R` returns
// non-zero. This is the "stub spawn" path the issue brief approves; a
// natural reproduction would require injecting a filesystem mutation
// between apply and revert, which the heal CLI doesn't expose.

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = dirname(__filename);
const ORCH_ROOT = resolve(SRC_DIR, "..");
const DIST_INDEX = join(ORCH_ROOT, "dist", "index.js");

// Build a tiny shim dir that intercepts `git` on PATH. The shim forwards
// every git invocation to the real `git`, EXCEPT `git apply -R <patch>`
// which exits non-zero with a recognizable stderr message. Returns the
// shim dir path; caller prepends it to PATH.
async function makeGitShim(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sb-git-shim-"));
  // Find the real git binary so the shim can delegate.
  const which = spawnSync("which", ["git"], { encoding: "utf8" });
  const realGit = (which.stdout ?? "").trim();
  if (!realGit) throw new Error("real git not on PATH for shim setup");
  const script =
    `#!/usr/bin/env bash\n` +
    `# heal-test git shim: fail only on \`git apply -R\`.\n` +
    `if [ "$1" = "apply" ] && [ "$2" = "-R" ]; then\n` +
    `  echo "stub: git apply -R intentionally failing for test" 1>&2\n` +
    `  exit 1\n` +
    `fi\n` +
    `exec ${JSON.stringify(realGit)} "$@"\n`;
  const shimPath = join(dir, "git");
  await writeFile(shimPath, script);
  await chmod(shimPath, 0o755);
  return dir;
}

describe("CLI verb: heal — revert-failure escalation (issue #17)", () => {
  it(
    "exit=2, stderr=DIRTY, EXP records safetyRegression=revert-failed, decision=revert",
    async () => {
      // 1. Build a tiny git repo so `git apply` + `--check` succeed.
      const repo = await mkdtemp(join(tmpdir(), "sb-heal-revert-fail-"));
      const git = (args: string[]) =>
        spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      git(["init", "-q"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "test"]);
      const targetPath = join(repo, "target.txt");
      await writeFile(targetPath, "alpha\nbeta\ngamma\n");
      git(["add", "."]);
      git(["commit", "-q", "-m", "init"]);

      // 2. Patch that adds a line — applies cleanly forward.
      const patchPath = join(repo, "mutation.patch");
      const patch = [
        "diff --git a/target.txt b/target.txt",
        "--- a/target.txt",
        "+++ b/target.txt",
        "@@ -1,3 +1,4 @@",
        " alpha",
        " beta",
        " gamma",
        "+delta",
        "",
      ].join("\n");
      await writeFile(patchPath, patch);

      // 3. Build the git shim that fails ONLY on `apply -R`.
      const shimDir = await makeGitShim();

      // 4. Spawn `heal` with shim ahead of PATH and cwd=repo (so `git apply`
      //    operates on the test repo, not the orchestrator checkout).
      const expDir = join(repo, "experiments");
      const result = spawnSync(
        process.execPath,
        [
          DIST_INDEX,
          "heal",
          "--mutation",
          patchPath,
          "--baseline-set",
          "B",
          "--experiments-dir",
          expDir,
        ],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${shimDir}:${process.env.PATH ?? ""}`,
          },
        },
      );

      // 5. Assertions.
      expect(result.status, `stderr was: ${result.stderr}`).toBe(2);
      expect(result.stderr).toMatch(/DIRTY/);
      expect(result.stderr).toMatch(/Manual cleanup required/);

      // EXP-NNN.json must exist and record the revert-failed state.
      expect(existsSync(expDir)).toBe(true);
      const exp = JSON.parse(
        await readFile(join(expDir, "EXP-001.json"), "utf8"),
      ) as { decision: string; safetyRegression: string };
      expect(exp.decision).toBe("revert");
      expect(exp.safetyRegression).toBe("revert-failed");
    },
    60000,
  );
});
