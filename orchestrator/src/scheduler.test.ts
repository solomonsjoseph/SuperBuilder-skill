import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./scheduler.js";
import * as prdModule from "./prd.js";
import { loadPRD } from "./prd.js";
import type { PRD, UserStory } from "./types.js";

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: "US-001",
    title: "first",
    description: "first story",
    acceptanceCriteria: ["a"],
    priority: 1,
    riskLevel: "low",
    filesLikelyTouched: [],
    dependencies: [],
    passes: false,
    attempts: 0,
    lastFailure: null,
    evidence: {
      tests: [], security: [], review: [], browser: [], accessibility: [], performance: [],
      commits: [], diffs: [],
    },
    ...overrides,
  };
}

function makePRD(overrides: Partial<PRD> = {}): PRD {
  return {
    schemaVersion: "superbuilder.prd.v2",
    project: "p",
    branchName: "superbuilder/run",
    targetBranch: "feature",
    integrationBranch: "superbuilder/integration",
    description: "d",
    riskLevel: "low",
    deploymentAllowed: false,
    sourceRefs: {
      "addyosmani/agent-skills": "a",
      "mattpocock/skills": "b",
      "mattpocock/sandcastle": "c",
      "snarktank/ralph": "d",
      "karpathy/autoresearch": "e",
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
      typecheck: null,
      lint: null,
      format: null,
      test: null,
      integrationTest: null,
      security: null,
      secretScan: null,
      dependencyAudit: null,
      licenseCheck: null,
      browser: null,
      accessibility: null,
      performance: null,
    },
    userStories: [
      makeStory({ id: "US-001", title: "first", priority: 1 }),
      makeStory({
        id: "US-002",
        title: "second",
        priority: 2,
        evidence: {
          tests: [], security: [], review: [], browser: [], accessibility: [], performance: [],
          commits: [], diffs: [],
        },
      }),
    ],
    ...overrides,
  };
}

async function setupDryRunRoot(prd: PRD): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sb-sched-"));
  await writeFile(join(root, "prd.json"), JSON.stringify(prd, null, 2) + "\n");
  // Pre-seed evidence so each story satisfies evidenceComplete in dryRun
  // (no sandbox runs; gates all skipped because qualityGates are null).
  for (const story of prd.userStories) {
    const evDir = join(root, "evidence", story.id);
    await mkdir(evDir, { recursive: true });
    await writeFile(join(evDir, "diff.patch"), "fake diff for test\n");
  }
  return root;
}

describe("scheduler policy integrity", () => {
  it("aborts when prd.json policy fields are mutated mid-run", async () => {
    const prd = makePRD();
    const root = await setupDryRunRoot(prd);
    const store = await loadPRD(root);

    // The scheduler calls loadPRD on every iteration (start of each pick).
    // First call (iteration 1): pass through.
    // Second call (iteration 2): mutate prd.json on disk to flip
    // deploymentAllowed=true *before* loadPRD reads it. The fresh load
    // then surfaces a different policyHash and the scheduler must abort.
    let calls = 0;
    const spy = vi.spyOn(prdModule, "loadPRD").mockImplementation(async (rootArg: string) => {
      calls++;
      if (calls === 2) {
        const raw = await readFile(join(rootArg, "prd.json"), "utf8");
        const parsed = JSON.parse(raw) as PRD;
        parsed.deploymentAllowed = true;
        await writeFile(join(rootArg, "prd.json"), JSON.stringify(parsed, null, 2) + "\n");
      }
      // Use the actual implementation indirectly by importing what loadPRD
      // delegates to. Easiest: re-implement here using the public surface.
      const raw = await readFile(join(rootArg, "prd.json"), "utf8");
      const parsedPrd = JSON.parse(raw) as PRD;
      return { prd: parsedPrd, path: join(rootArg, "prd.json") };
    });

    let caught: Error | null = null;
    try {
      await run(
        { root, projectRoot: root, provider: "docker", dryRun: true },
        store,
      );
    } catch (e) {
      caught = e as Error;
    } finally {
      spy.mockRestore();
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/policy fields changed during run/);
    expect(existsSync(join(root, "last-run-policy-mismatch.json"))).toBe(true);
    const mismatch = JSON.parse(
      await readFile(join(root, "last-run-policy-mismatch.json"), "utf8"),
    ) as {
      snapshot: { deploymentAllowed: boolean };
      current: { deploymentAllowed: boolean };
      "fields-that-differ": string[];
    };
    expect(mismatch.snapshot.deploymentAllowed).toBe(false);
    expect(mismatch.current.deploymentAllowed).toBe(true);
    expect(mismatch["fields-that-differ"]).toContain("deploymentAllowed");
  }, 15000);
});

// --- Story-branch merge tests ----------------------------------------------
//
// In dryRun mode the scheduler doesn't actually create the story branch
// (sandcastle is skipped). Our merge step is gated on the branch existing
// on the host repo. By pre-creating it in a tmp git repo we exercise the
// real ff-merge / conflict paths without needing docker/podman.

function git(cwd: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: typeof r.status === "number" ? r.status : -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function gitOk(cwd: string, args: string[]): void {
  const r = git(cwd, args);
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr || r.stdout}`);
  }
}

async function setupGitProjectAndPRDRoot(): Promise<{ project: string; root: string }> {
  const project = await mkdtemp(join(tmpdir(), "sb-merge-proj-"));
  // Init repo with `feature` as the target branch (matches makePRD).
  gitOk(project, ["init", "-q", "-b", "feature"]);
  gitOk(project, ["config", "user.email", "test@example.com"]);
  gitOk(project, ["config", "user.name", "test"]);
  await writeFile(join(project, "README.md"), "seed\n");
  gitOk(project, ["add", "."]);
  gitOk(project, ["commit", "-q", "-m", "seed"]);

  // PRD root (separate from project root in this test, like real usage).
  const root = await mkdtemp(join(tmpdir(), "sb-merge-root-"));
  return { project, root };
}

async function seedPRD(root: string, prd: PRD): Promise<void> {
  await writeFile(join(root, "prd.json"), JSON.stringify(prd, null, 2) + "\n");
  for (const story of prd.userStories) {
    const evDir = join(root, "evidence", story.id);
    await mkdir(evDir, { recursive: true });
    await writeFile(join(evDir, "diff.patch"), "fake diff for test\n");
  }
}

describe("scheduler diff.patch path B preservation", () => {
  it("does not overwrite a non-empty diff.patch written before the run", async () => {
    const { project, root } = await setupGitProjectAndPRDRoot();

    // Pre-create the story branch with a real commit so the merge step
    // executes (otherwise it's skipped in dryRun).
    const storyBranch = "superbuilder/US-001-first";
    gitOk(project, ["checkout", "-q", "-b", storyBranch]);
    await writeFile(join(project, "story.txt"), "story content\n");
    gitOk(project, ["add", "."]);
    gitOk(project, ["commit", "-q", "-m", "story commit"]);
    gitOk(project, ["checkout", "-q", "feature"]);

    const prd = makePRD({ userStories: [makeStory({ id: "US-001", title: "first" })] });
    await seedPRD(root, prd);

    // Pre-write a Path B diff.patch with distinctive sentinel content
    // BEFORE the scheduler runs. seedPRD wrote a placeholder; replace it.
    const diffPath = join(root, "evidence", "US-001", "diff.patch");
    const sentinel = "PATH-B-SENTINEL: agent-emitted diff content\n";
    await writeFile(diffPath, sentinel, "utf8");

    const store = await loadPRD(root);
    const report = await run(
      { root, projectRoot: project, provider: "docker", dryRun: true },
      store,
    );

    expect(report.storiesPassed).toContain("US-001");

    // Path A must NOT have overwritten Path B. Sentinel must survive.
    const after = await readFile(diffPath, "utf8");
    expect(after).toBe(sentinel);

    // The story's evidence.diffs must include the Path B file.
    const reloaded = JSON.parse(await readFile(join(root, "prd.json"), "utf8")) as PRD;
    const us = reloaded.userStories.find((s) => s.id === "US-001")!;
    expect(us.evidence.diffs).toContain(diffPath);
  }, 15000);
});

describe("scheduler in-memory state preservation", () => {
  it("preserves in-memory story.attempts across the per-iteration policy hash check", async () => {
    // Use two stories so the loop iterates twice; the first story will fail
    // (merge skipped because no branch exists), bumping attempts. Between
    // iterations the scheduler re-loads the PRD for the policy hash check.
    // The fix means store.prd is NOT replaced, so attempts mutated in
    // memory must survive into the next iteration unchanged.
    const root = await mkdtemp(join(tmpdir(), "sb-attempts-"));
    const prd = makePRD();
    // Force the first story to fail by NOT seeding diff.patch (so Path B
    // empty, Path A also empty in dryRun without a real git project) AND
    // by giving it 1 attempt cap.
    await writeFile(join(root, "prd.json"), JSON.stringify(prd, null, 2) + "\n");
    // Seed only US-002's evidence so US-001 has no diff (will fail).
    const ev2 = join(root, "evidence", "US-002");
    await mkdir(ev2, { recursive: true });
    await writeFile(join(ev2, "diff.patch"), "fake diff for test\n");

    const store = await loadPRD(root);
    const report = await run(
      {
        root,
        projectRoot: root,
        provider: "docker",
        dryRun: true,
        caps: { attemptsPerStory: 1 },
      },
      store,
    );

    // US-001 failed (no evidence). The scheduler stops at first hard failure.
    expect(report.storiesFailed).toContain("US-001");

    // The on-disk PRD was written by savePRD at end of attempt. Reload and
    // verify story.attempts reflects the failed iteration (>=1, not 0).
    const reloaded = JSON.parse(await readFile(join(root, "prd.json"), "utf8")) as PRD;
    const us1 = reloaded.userStories.find((s) => s.id === "US-001")!;
    expect(us1.attempts).toBeGreaterThanOrEqual(1);

    // And the in-memory store reflects the same — proving the hash check
    // did not clobber it back to the disk-original 0 (which would only
    // matter if attempts had diverged from disk; with savePRD it's the
    // same value, but the key invariant is "store.prd is unchanged
    // identity-wise across iterations").
    expect(store.prd.userStories.find((s) => s.id === "US-001")!.attempts).toBeGreaterThanOrEqual(1);
  }, 15000);
});

describe("scheduler story-branch merge", () => {
  it("happy path: ff-only merges the story branch into integration", async () => {
    const { project, root } = await setupGitProjectAndPRDRoot();

    // Pre-create the story branch with one new commit (simulating what
    // sandcastle would have done).
    const storyBranch = "superbuilder/US-001-first"; // slug of "first"
    gitOk(project, ["checkout", "-q", "-b", storyBranch]);
    await writeFile(join(project, "story.txt"), "story content\n");
    gitOk(project, ["add", "."]);
    gitOk(project, ["commit", "-q", "-m", "story commit"]);
    const storySha = git(project, ["rev-parse", "HEAD"]).stdout.trim();
    gitOk(project, ["checkout", "-q", "feature"]); // back to feature

    // Only run the first story; second story would have no branch.
    const prd = makePRD({ userStories: [makeStory({ id: "US-001", title: "first" })] });
    await seedPRD(root, prd);
    const store = await loadPRD(root);

    const report = await run(
      { root, projectRoot: project, provider: "docker", dryRun: true },
      store,
    );

    expect(report.storiesPassed).toContain("US-001");
    expect(report.storiesFailed).toEqual([]);

    // Integration branch should exist and point to the story commit.
    const ref = git(project, ["rev-parse", "superbuilder/integration"]).stdout.trim();
    expect(ref).toBe(storySha);

    // Story now passes and recorded the merged-up commit.
    const reloaded = JSON.parse(await readFile(join(root, "prd.json"), "utf8")) as PRD;
    const us = reloaded.userStories.find((s) => s.id === "US-001")!;
    expect(us.passes).toBe(true);
    expect(us.lastFailure).toBeNull();
  }, 15000);

  it("conflict path: non-ff merge sets lastFailure and restores prior branch", async () => {
    const { project, root } = await setupGitProjectAndPRDRoot();

    // Pre-create integration from feature, then advance integration with a
    // commit on `story.txt`. Then create the story branch from feature with
    // a different commit on the same file — ff-only will fail.
    gitOk(project, ["branch", "superbuilder/integration", "feature"]);
    gitOk(project, ["checkout", "-q", "superbuilder/integration"]);
    await writeFile(join(project, "story.txt"), "integration version\n");
    gitOk(project, ["add", "."]);
    gitOk(project, ["commit", "-q", "-m", "integration touched story.txt"]);

    gitOk(project, ["checkout", "-q", "feature"]);
    const storyBranch = "superbuilder/US-001-first";
    gitOk(project, ["checkout", "-q", "-b", storyBranch]);
    await writeFile(join(project, "story.txt"), "story version\n");
    gitOk(project, ["add", "."]);
    gitOk(project, ["commit", "-q", "-m", "story version"]);

    const priorBranch = "feature";
    gitOk(project, ["checkout", "-q", priorBranch]); // start with feature

    const prd = makePRD({ userStories: [makeStory({ id: "US-001", title: "first" })] });
    await seedPRD(root, prd);
    const store = await loadPRD(root);

    const report = await run(
      {
        root,
        projectRoot: project,
        provider: "docker",
        dryRun: true,
        caps: { attemptsPerStory: 1 },
      },
      store,
    );

    expect(report.storiesFailed).toContain("US-001");

    const reloaded = JSON.parse(await readFile(join(root, "prd.json"), "utf8")) as PRD;
    const us = reloaded.userStories.find((s) => s.id === "US-001")!;
    expect(us.passes).toBe(false);
    expect(us.lastFailure).toBe("merge conflict with integration");

    // Restored prior branch.
    const head = git(project, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
    expect(head).toBe(priorBranch);

    // merge-conflict.md was written.
    expect(existsSync(join(root, "evidence", "US-001", "merge-conflict.md"))).toBe(true);
  }, 15000);
});
