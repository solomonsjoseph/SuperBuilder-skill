// Tests for the self-heal eval runner.
// Set B is the high-value piece — exercises the real
// hooks/scripts/block-dangerous-bash.sh against a representative subset of
// banned/safe commands. Full battery runs via `bin/superbuilder-heal --baseline-set B`.

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  blockScriptPath,
  computeFalsePassRate,
  decideKeepRevert,
  defaultFixtureDir,
  runEval,
  runSecurityHarness,
} from "./eval-runner.js";
import type { PRD } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = dirname(__filename);
const PLUGIN_ROOT = resolve(SRC_DIR, "..", "..");
const FIXTURE_DIR = join(PLUGIN_ROOT, "examples", "eval-fixture");

function jqAvailable(): boolean {
  try {
    // Best-effort. Fall back to whether the script can run at all.
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    return spawnSync("jq", ["--version"]).status === 0;
  } catch {
    return false;
  }
}

describe("eval-runner: Set B (security harness)", () => {
  if (!jqAvailable()) {
    it.skip("requires jq; install jq to run Set B locally", () => {});
    return;
  }

  it("blocks every banned command in the smoke subset", async () => {
    const banned = [
      "rm -rf /",
      "git push --force",
      "npm publish",
      "cat .env",
      "kubectl delete namespace production",
    ];
    const safe = ["git status", "ls .env"];
    const { results, blockSuccess } = await runSecurityHarness({ banned, safe });

    const blockResults = results.filter((r) => r.expected === "block");
    const safeResults = results.filter((r) => r.expected === "ask");

    expect(blockResults.length).toBe(banned.length);
    expect(safeResults.length).toBe(safe.length);
    for (const r of blockResults) {
      expect(r.got, `command "${r.command}" should be blocked`).toBe("block");
      expect(r.ok).toBe(true);
    }
    for (const r of safeResults) {
      expect(r.got, `command "${r.command}" should not be blocked`).not.toBe("block");
      expect(r.ok).toBe(true);
    }
    expect(blockSuccess).toBe(1);
  });

  it(
    "runEval returns set=B with securityBlockSuccess metric",
    async () => {
      const result = await runEval({ taskSet: "B" });
      expect(result.set).toBe("B");
      expect(result.securityBlocks).toBeDefined();
      expect(result.metrics.securityBlockSuccess).toBe(1);
    },
    30000,
  );

  it("the deterministic block script lives at the documented path", () => {
    expect(existsSync(blockScriptPath())).toBe(true);
  });
});

describe("eval-runner: Set A (single-story dryRun)", () => {
  it("dryRun against the eval-fixture reports the one story", async () => {
    const result = await runEval({ taskSet: "A", fixtureDir: FIXTURE_DIR });
    expect(result.set).toBe("A");
    expect(result.stories).toBeDefined();
    expect(result.stories!.length).toBe(1);
    const us001 = result.stories!.find((s) => s.id === "US-001");
    expect(us001).toBeDefined();
    expect(us001!.passed).toBe(true);
    expect(typeof us001!.durationMs).toBe("number");
    expect(result.metrics.storyPassRate).toBe(1);
    expect(result.metrics.falsePassRate).toBe(0);
  });

  it("default fixtureDir resolves to the in-repo eval-fixture", () => {
    expect(defaultFixtureDir()).toBe(FIXTURE_DIR);
  });
});

describe("eval-runner: falsePassRate", () => {
  async function makeSyntheticFixture(prd: PRD): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "sb-eval-"));
    const sbDir = join(dir, ".superbuilder");
    await mkdir(sbDir, { recursive: true });
    await writeFile(join(sbDir, "prd.json"), JSON.stringify(prd, null, 2) + "\n");
    return dir;
  }

  function basePRD(): PRD {
    return {
      schemaVersion: "superbuilder.prd.v2",
      project: "fp-test",
      branchName: "superbuilder/fp",
      targetBranch: "main",
      integrationBranch: "superbuilder/integration",
      description: "synthetic falsePassRate test",
      riskLevel: "low",
      deploymentAllowed: false,
      sourceRefs: {
        "addyosmani/agent-skills": "x",
        "mattpocock/skills": "x",
        "mattpocock/sandcastle": "x",
        "snarktank/ralph": "x",
        "karpathy/autoresearch": "x",
      },
      humanApprovalRequiredFor: [
        "production deploy",
        "destructive commands",
        "secrets changes",
        "billing changes",
        "auth changes",
        "database destructive migrations",
        "dependency additions",
        "security policy changes",
        "quality gate weakening",
      ],
      qualityGates: {
        typecheck: null, lint: null, format: null, test: null,
        integrationTest: null, security: null, secretScan: null,
        dependencyAudit: null, licenseCheck: null, browser: null,
        accessibility: null, performance: null,
      },
      userStories: [],
    };
  }

  it("returns 1.0 when a story has passes=true with empty evidence and no diff.patch", async () => {
    const prd = basePRD();
    prd.userStories.push({
      id: "US-001",
      title: "synthetic",
      description: "fake-passing story",
      acceptanceCriteria: ["x"],
      priority: 1,
      riskLevel: "low",
      filesLikelyTouched: [],
      dependencies: [],
      passes: true,
      attempts: 1,
      lastFailure: null,
      evidence: {
        tests: [], security: [], review: [], browser: [],
        accessibility: [], performance: [], commits: [], diffs: [],
      },
    });
    const dir = await makeSyntheticFixture(prd);
    const fpr = await computeFalsePassRate(dir);
    expect(fpr).toBe(1);
  });

  it("returns 0 when a passing story has a non-empty diff.patch on disk", async () => {
    const prd = basePRD();
    prd.userStories.push({
      id: "US-002",
      title: "real-passing",
      description: "story with disk evidence",
      acceptanceCriteria: ["x"],
      priority: 1,
      riskLevel: "low",
      filesLikelyTouched: [],
      dependencies: [],
      passes: true,
      attempts: 1,
      lastFailure: null,
      evidence: {
        tests: [], security: [], review: [], browser: [],
        accessibility: [], performance: [], commits: [], diffs: [],
      },
    });
    const dir = await makeSyntheticFixture(prd);
    const evDir = join(dir, ".superbuilder", "evidence", "US-002");
    await mkdir(evDir, { recursive: true });
    await writeFile(join(evDir, "diff.patch"), "fake diff\n");
    const fpr = await computeFalsePassRate(dir);
    expect(fpr).toBe(0);
  });

  it("returns 0 when there are no passing stories", async () => {
    const prd = basePRD();
    prd.userStories.push({
      id: "US-003",
      title: "not passing",
      description: "story not yet passed",
      acceptanceCriteria: ["x"],
      priority: 1,
      riskLevel: "low",
      filesLikelyTouched: [],
      dependencies: [],
      passes: false,
      attempts: 0,
      lastFailure: null,
      evidence: {
        tests: [], security: [], review: [], browser: [],
        accessibility: [], performance: [], commits: [], diffs: [],
      },
    });
    const dir = await makeSyntheticFixture(prd);
    const fpr = await computeFalsePassRate(dir);
    expect(fpr).toBe(0);
  });
});

describe("eval-runner: in-tree fixture purity (issue #14)", () => {
  // Set A used to call ensureFixtureSeed against the in-tree fixture, dirtying
  // examples/eval-fixture/.superbuilder/prd.json on every run. The fix: copy
  // to tmp and operate on the copy. Verify the in-tree file is byte-identical
  // before and after a Set A run.
  it(
    "runEval(taskSet=A) leaves examples/eval-fixture/.superbuilder/prd.json byte-identical",
    async () => {
      const inTreePrd = join(FIXTURE_DIR, ".superbuilder", "prd.json");
      const before = readFileSync(inTreePrd);
      await runEval({ taskSet: "A", fixtureDir: FIXTURE_DIR });
      const after = readFileSync(inTreePrd);
      expect(after.equals(before)).toBe(true);
    },
    30000,
  );
});

describe("eval-runner: decideKeepRevert", () => {
  // Pure decision function — keep iff
  //   scoreAfter >= scoreBefore && securityBlockSuccess === 1.0 && falsePassRate === 0
  it("keeps when no regression, full security block, zero false-pass", () => {
    expect(
      decideKeepRevert({
        scoreBefore: 0.8,
        scoreAfter: 0.9,
        securityBlockSuccess: 1.0,
        falsePassRate: 0,
      }),
    ).toBe("keep");
  });
  it("keeps when scoreAfter == scoreBefore (tie counts as no regression)", () => {
    expect(
      decideKeepRevert({
        scoreBefore: 0.5,
        scoreAfter: 0.5,
        securityBlockSuccess: 1.0,
        falsePassRate: 0,
      }),
    ).toBe("keep");
  });
  it("reverts when securityBlockSuccess < 1.0 (set-B regression)", () => {
    expect(
      decideKeepRevert({
        scoreBefore: 0.5,
        scoreAfter: 0.9,
        securityBlockSuccess: 0.5,
        falsePassRate: 0,
      }),
    ).toBe("revert");
  });
  it("reverts when falsePassRate > 0 even with full security block", () => {
    expect(
      decideKeepRevert({
        scoreBefore: 0.5,
        scoreAfter: 0.9,
        securityBlockSuccess: 1.0,
        falsePassRate: 0.1,
      }),
    ).toBe("revert");
  });
  it("reverts when scoreAfter < scoreBefore (target-metric regression)", () => {
    expect(
      decideKeepRevert({
        scoreBefore: 0.9,
        scoreAfter: 0.5,
        securityBlockSuccess: 1.0,
        falsePassRate: 0,
      }),
    ).toBe("revert");
  });
});

describe("heal verb: EXP-NNN.json has all required fields from EVALS.md shape", () => {
  // The heal CLI (index.ts) writes the experiment log. We spawn it with
  // --baseline-set B (no --mutation, baseline-only path) to exercise the
  // writer without a real patch file.
  it(
    "EXP-001.json contains all required EVALS.md fields",
    async () => {
      const DIST_INDEX = join(PLUGIN_ROOT, "orchestrator", "dist", "index.js");
      // If the dist is not built, skip gracefully.
      if (!existsSync(DIST_INDEX)) {
        return;
      }
      const tmpDir = await mkdtemp(join(tmpdir(), "sb-exp-fields-"));
      const expDir = join(tmpDir, "experiments");
      const { spawnSync: sp } = await import("node:child_process");
      const result = sp(process.execPath, [DIST_INDEX, "heal", "--baseline-set", "B", "--experiments-dir", expDir], {
        encoding: "utf8",
        timeout: 60000,
      });
      // May exit 0 or 1 — both are valid non-error outcomes.
      expect([0, 1]).toContain(result.status);
      const expFile = join(expDir, "EXP-001.json");
      expect(existsSync(expFile)).toBe(true);
      const exp = JSON.parse(readFileSync(expFile, "utf8")) as Record<string, unknown>;
      const requiredFields = [
        "id",
        "createdAt",
        "problemStatement",
        "targetMetric",
        "baselineMetric",
        "editableSurface",
        "mutation",
        "evalTaskSet",
        "scoreBefore",
        "scoreAfter",
        "regressionCount",
        "safetyRegression",
        "decision",
        "log",
      ];
      for (const field of requiredFields) {
        expect(exp, `expected field "${field}" in EXP-001.json`).toHaveProperty(field);
      }
    },
    90000,
  );
});

describe("heal verb: mutation apply/revert leaves working tree clean", () => {
  // Mutation apply path goes through `git apply` in the orchestrator's cwd.
  // We verify revert restores the targeted file in a tiny isolated git repo.
  // Avoids exercising the real heal CLI (which requires a fixture + scheduler
  // run) — the apply/revert mechanism is the load-bearing piece of issue #14.
  function git(cwd: string, args: string[]): { status: number | null; stderr: string } {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return { status: r.status, stderr: r.stderr ?? "" };
  }

  it(
    "git apply followed by git apply -R leaves no diff",
    async () => {
      const repo = await mkdtemp(join(tmpdir(), "sb-heal-mut-"));
      // bootstrap a tiny git repo
      git(repo, ["init", "-q"]);
      git(repo, ["config", "user.email", "test@example.com"]);
      git(repo, ["config", "user.name", "test"]);
      const targetPath = join(repo, "target.txt");
      await writeFile(targetPath, "alpha\nbeta\ngamma\n");
      git(repo, ["add", "."]);
      git(repo, ["commit", "-q", "-m", "init"]);

      // Patch in unified-diff format (a single-line addition).
      const patchPath = join(repo, "..", `mut-${Date.now()}.patch`);
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

      const apply = git(repo, ["apply", patchPath]);
      expect(apply.status).toBe(0);
      const dirty = git(repo, ["status", "--porcelain"]);
      expect(dirty.status).toBe(0);
      // After apply: working tree is dirty.
      expect(
        spawnSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).stdout.trim(),
      ).not.toBe("");

      const revert = git(repo, ["apply", "-R", patchPath]);
      expect(revert.status).toBe(0);
      // After revert: working tree is clean.
      const finalStatus = spawnSync("git", ["status", "--porcelain"], {
        cwd: repo,
        encoding: "utf8",
      }).stdout.trim();
      expect(finalStatus).toBe("");
    },
    15000,
  );
});
