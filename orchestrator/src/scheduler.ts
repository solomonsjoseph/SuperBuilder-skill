import { writeFile, mkdir, appendFile, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { PRD, UserStory } from "./types.js";
import { DEFAULT_CAPS } from "./types.js";
import { selectNextStory, savePRD, evidenceComplete, loadPRD } from "./prd.js";
import type { PRDStore } from "./prd.js";
import { runGate, relevantGates } from "./gates.js";
import type { GateResult } from "./gates.js";
import { createSandbox } from "./sandcastle-runner.js";
import type { Provider } from "./sandcastle-runner.js";
import { policyHash, extractPolicy, policyDiff } from "./security.js";

export interface RunOptions {
  root: string;          // .superbuilder dir
  projectRoot: string;
  provider: Provider;
  caps?: Partial<typeof DEFAULT_CAPS>;
  dryRun?: boolean;      // skip Sandcastle, only run gates
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  storiesAttempted: string[];
  storiesPassed: string[];
  storiesFailed: string[];
  notes: string[];
}

export async function run(opts: RunOptions, store: PRDStore): Promise<RunReport> {
  const caps = { ...DEFAULT_CAPS, ...(opts.caps ?? {}) };
  const startedAt = new Date().toISOString();
  const report: RunReport = {
    startedAt,
    finishedAt: "",
    storiesAttempted: [],
    storiesPassed: [],
    storiesFailed: [],
    notes: [],
  };

  if (store.prd.deploymentAllowed) {
    throw new Error(
      "PRD has deploymentAllowed=true. Refusing to start; production deploy requires a separate explicit approval flow (/superbuilder:supership).",
    );
  }

  // Snapshot the PRD's security-relevant fields. Before each story we
  // reload PRD from disk and re-hash; on mismatch we abort. Defense in
  // depth against a subagent mutating .superbuilder/prd.json mid-run.
  const policySnapshotHash = policyHash(store.prd);
  const policySnapshot = extractPolicy(store.prd);

  let storiesRun = 0;
  while (true) {
    if (caps.fullRunStories !== null && storiesRun >= caps.fullRunStories) {
      report.notes.push(`Hit fullRunStories cap (${caps.fullRunStories}); stopping.`);
      break;
    }

    // Re-verify policy integrity before picking the next story. We re-load
    // the PRD from disk ONLY to detect tampering of policy fields. We do
    // NOT replace store.prd — that would discard in-memory mutations made
    // in prior iterations (attempts++, lastFailure, passes, evidence
    // arrays). savePRD(store) at the end of each attempt persists the
    // in-memory state to disk anyway, so the on-disk PRD that `fresh` reads
    // already reflects the latest legitimate state.
    const fresh = await loadPRD(opts.root);
    const currentHash = policyHash(fresh.prd);
    if (currentHash !== policySnapshotHash) {
      const currentPolicy = extractPolicy(fresh.prd);
      const fieldsThatDiffer = policyDiff(policySnapshot, currentPolicy);
      await mkdir(opts.root, { recursive: true });
      await writeFile(
        join(opts.root, "last-run-policy-mismatch.json"),
        JSON.stringify(
          {
            snapshot: policySnapshot,
            current: currentPolicy,
            "fields-that-differ": fieldsThatDiffer,
          },
          null,
          2,
        ) + "\n",
      );
      throw new Error(
        "Superbuilder policy fields changed during run; aborting. See .superbuilder/last-run-policy-mismatch.json.",
      );
    }
    // Discard `fresh`. store.prd remains the authoritative in-memory state.

    const story = selectNextStory(store.prd);
    if (!story) {
      report.notes.push("No eligible stories remaining. Done.");
      break;
    }
    report.storiesAttempted.push(story.id);
    storiesRun++;

    const passed = await runOneStory(story, store, opts, caps);
    if (passed) {
      report.storiesPassed.push(story.id);
    } else {
      report.storiesFailed.push(story.id);
      // Stop on the first hard failure: the human should look.
      report.notes.push(`Story ${story.id} failed after ${story.attempts} attempts; stopping for human review.`);
      break;
    }
  }

  report.finishedAt = new Date().toISOString();

  await mkdir(opts.root, { recursive: true });
  await writeFile(join(opts.root, "last-run.json"), JSON.stringify(report, null, 2) + "\n");
  await appendProgress(opts.root, report);

  return report;
}

async function runOneStory(
  story: UserStory,
  store: PRDStore,
  opts: RunOptions,
  caps: typeof DEFAULT_CAPS,
): Promise<boolean> {
  const evidenceDir = join(opts.root, "evidence", story.id);
  await mkdir(evidenceDir, { recursive: true });

  while (story.attempts < caps.attemptsPerStory) {
    story.attempts++;
    const branch = `superbuilder/${story.id}-${slugify(story.title)}`;
    // Commits produced by sandcastle during this attempt (host-visible after
    // sandbox.close() with bind-mount providers). Used both for evidence and
    // for the host-side ff merge below.
    const sandboxCommits: string[] = [];

    if (!opts.dryRun) {
      // Place agents in a sandbox; one branch per story; multiple runs inside.
      const sandbox = await createSandbox({
        branch,
        provider: opts.provider,
        projectRoot: opts.projectRoot,
      });
      try {
        const promptDir = join(opts.root, "prompts");
        await mkdir(promptDir, { recursive: true });
        await writePromptIfMissing(join(promptDir, `${story.id}-implement.md`), implementPrompt(story));
        await writePromptIfMissing(join(promptDir, `${story.id}-verify.md`), verifyPrompt(story));
        await writePromptIfMissing(join(promptDir, `${story.id}-review.md`), reviewPrompt(story));

        const impl = await sandbox.run({
          name: `implement-${story.id}`,
          promptFile: join(promptDir, `${story.id}-implement.md`),
          maxIterations: 1,
        });
        sandboxCommits.push(...impl.commits);
        if (!impl.ok) {
          story.lastFailure = `implement: ${impl.notes}`;
          await savePRD(store);
          continue;
        }
        const verify = await sandbox.run({
          name: `verify-${story.id}`,
          promptFile: join(promptDir, `${story.id}-verify.md`),
          maxIterations: 1,
        });
        sandboxCommits.push(...verify.commits);
        if (!verify.ok) {
          story.lastFailure = `verify: ${verify.notes}`;
          await savePRD(store);
          continue;
        }
        const review = await sandbox.run({
          name: `review-${story.id}`,
          promptFile: join(promptDir, `${story.id}-review.md`),
          maxIterations: 1,
        });
        sandboxCommits.push(...review.commits);
        if (!review.ok) {
          story.lastFailure = `review: ${review.notes}`;
          await savePRD(store);
          continue;
        }
      } finally {
        await sandbox.close();
      }
    }

    // Gates run regardless — they're the evidence.
    const gates = relevantGates(story);
    const gateResults: GateResult[] = [];
    // Derived from store.prd — the in-memory snapshot loaded at run() start.
    // store.prd is never replaced in-place; the policy-integrity check above
    // would have aborted already if humanApprovalRequiredFor was tampered.
    const allowedHighRisk = store.prd.humanApprovalRequiredFor.some(
      (entry) => entry.toLowerCase() === "exec gate command",
    );
    for (const g of gates) {
      const cmd = store.prd.qualityGates[g];
      const result = await runGate(g, cmd, evidenceDir, { allowedHighRisk });
      gateResults.push(result);
      if (g === "test" && result.evidencePath) story.evidence.tests.push(result.evidencePath);
      if (g === "browser" && result.evidencePath) story.evidence.browser.push(result.evidencePath);
      if (g === "accessibility" && result.evidencePath) story.evidence.accessibility.push(result.evidencePath);
      if (g === "performance" && result.evidencePath) story.evidence.performance.push(result.evidencePath);
      if ((g === "security" || g === "secretScan" || g === "dependencyAudit") && result.evidencePath) {
        story.evidence.security.push(result.evidencePath);
      }
    }

    const failures = gateResults.filter((r) => r.status === "failed");
    const erroredGates = gateResults.filter((r) => r.status === "errored");
    const diffPath = join(evidenceDir, "diff.patch");
    if (failures.length === 0 && erroredGates.length === 0) {
      // Record any sandbox-reported commits up-front so they're durable even
      // if the merge fails.
      for (const sha of sandboxCommits) {
        if (!story.evidence.commits.includes(sha)) story.evidence.commits.push(sha);
      }

      // Merge the story branch into superbuilder/integration. Bind-mount
      // sandcastle providers (docker, podman) commit on a real host worktree,
      // so after sandbox.close() the branch exists in the host repo.
      const merge = await mergeStoryIntoIntegration({
        projectRoot: opts.projectRoot,
        storyBranch: branch,
        targetBranch: store.prd.targetBranch,
        integrationBranch: store.prd.integrationBranch,
        evidenceDir,
        skip: opts.dryRun !== true ? false : !branchExists(opts.projectRoot, branch),
      });
      if (!merge.ok) {
        story.lastFailure = merge.lastFailure;
        await savePRD(store);
        continue;
      }
      // Path B is the source of truth: if the agent (or sandbox) wrote a
      // non-empty diff.patch, use it. The host process is rarely on the
      // story branch (sandcastle docker provider commits on a worktree, not
      // the host's main checkout), so a host-side `git diff` would clobber
      // the real evidence with an empty file.
      const agentDiffPresent =
        existsSync(diffPath) && statSync(diffPath).size > 0;
      if (!agentDiffPresent) {
        // Path A fallback: only when Path B did not write anything.
        const diff = git(
          ["diff", `${store.prd.targetBranch}...${store.prd.integrationBranch}`],
          opts.projectRoot,
        );
        if (diff) {
          await writeFile(diffPath, diff, "utf8");
        }
        // If Path A also produced nothing, do not fabricate a placeholder —
        // leave the story unable to pass; the Stop hook + evidenceComplete
        // already enforce that real evidence is required.
      }
      if (
        existsSync(diffPath) &&
        statSync(diffPath).size > 0 &&
        !story.evidence.diffs.includes(diffPath)
      ) {
        story.evidence.diffs.push(diffPath);
      }
      if (evidenceComplete(story, evidenceDir) && failures.length === 0 && erroredGates.length === 0) {
        story.passes = true;
        story.lastFailure = null;
        await savePRD(store);
        return true;
      }
    }
    // Build distinct lastFailure strings: errored (misconfig) and failed
    // (real test failure) get separate prefixes so operators know whether
    // to fix configuration or fix code. Errored is surfaced first because
    // a misconfigured gate blocks the operator's diagnostic.
    const erroredParts = erroredGates.map(
      (e) => `gate misconfigured: ${e.gate} (${e.reason ?? "unknown reason"})`,
    );
    const failedParts = failures.map(
      (f) => `gate failed: ${f.gate} (exit ${f.exitCode})`,
    );
    const allParts = [...erroredParts, ...failedParts];
    if (allParts.length > 0 || story.lastFailure === null) {
      story.lastFailure = allParts.length > 0 ? allParts.join("; ") : "evidence incomplete";
    }
    await savePRD(store);
  }

  return false;
}

function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status === 0) return (r.stdout ?? "").trim();
  return "";
}

function gitFull(
  args: string[],
  cwd: string,
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    status: typeof r.status === "number" ? r.status : -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function branchExists(projectRoot: string, branch: string): boolean {
  const r = spawnSync(
    "git",
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return r.status === 0;
}

function currentBranch(projectRoot: string): string {
  const r = git(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
  return r || "HEAD";
}

interface MergeArgs {
  projectRoot: string;
  storyBranch: string;
  targetBranch: string;
  integrationBranch: string;
  evidenceDir: string;
  skip: boolean;
}

interface MergeOutcome {
  ok: boolean;
  lastFailure: string;
}

/**
 * After a story passes review, merge its branch into integration with
 * --ff-only. Creates integration lazily from targetBranch on first use.
 *
 * Skipped (returns ok=true) when `skip` is set — used in dryRun where the
 * story branch was never created.
 */
async function mergeStoryIntoIntegration(args: MergeArgs): Promise<MergeOutcome> {
  if (args.skip) {
    return { ok: true, lastFailure: "" };
  }
  const { projectRoot, storyBranch, targetBranch, integrationBranch, evidenceDir } = args;

  // Ensure story branch exists on the host. If not, the sandcastle run did
  // not surface a host-visible worktree commit — surface as a soft failure
  // rather than a true conflict.
  if (!branchExists(projectRoot, storyBranch)) {
    return {
      ok: false,
      lastFailure: `story branch ${storyBranch} not found in host repo after sandbox close`,
    };
  }

  const prior = currentBranch(projectRoot);

  // Lazily create integration branch from targetBranch.
  if (!branchExists(projectRoot, integrationBranch)) {
    const created = gitFull(
      ["branch", integrationBranch, targetBranch],
      projectRoot,
    );
    if (created.status !== 0) {
      return {
        ok: false,
        lastFailure: `could not create ${integrationBranch} from ${targetBranch}: ${created.stderr.trim()}`,
      };
    }
  }

  // Checkout integration.
  const co = gitFull(["checkout", integrationBranch], projectRoot);
  if (co.status !== 0) {
    return {
      ok: false,
      lastFailure: `git checkout ${integrationBranch} failed: ${co.stderr.trim()}`,
    };
  }

  // ff-only merge.
  const merge = gitFull(["merge", "--ff-only", storyBranch], projectRoot);
  if (merge.status !== 0) {
    // Best-effort cleanup: abort + return to prior branch.
    gitFull(["merge", "--abort"], projectRoot);
    gitFull(["checkout", prior], projectRoot);
    const log = [
      `# Merge conflict: ${storyBranch} -> ${integrationBranch}`,
      "",
      `Command: git merge --ff-only ${storyBranch}`,
      `Exit code: ${merge.status}`,
      "",
      "Stderr:",
      "```",
      merge.stderr.trim() || "(no stderr)",
      "```",
      "",
      "Stdout:",
      "```",
      merge.stdout.trim() || "(no stdout)",
      "```",
      "",
    ].join("\n");
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, "merge-conflict.md"), log, "utf8");
    return { ok: false, lastFailure: "merge conflict with integration" };
  }

  return { ok: true, lastFailure: "" };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "story";
}

async function writePromptIfMissing(path: string, body: string): Promise<void> {
  if (existsSync(path)) return;
  await writeFile(path, body, "utf8");
}

async function appendProgress(root: string, report: RunReport): Promise<void> {
  const path = join(root, "progress.md");
  const lines: string[] = [
    `\n## Run ${report.startedAt} → ${report.finishedAt}`,
    "",
    `- attempted: ${report.storiesAttempted.join(", ") || "(none)"}`,
    `- passed:    ${report.storiesPassed.join(", ") || "(none)"}`,
    `- failed:    ${report.storiesFailed.join(", ") || "(none)"}`,
    ...report.notes.map((n) => `- note: ${n}`),
  ];
  if (existsSync(path)) {
    await appendFile(path, lines.join("\n") + "\n");
  } else {
    await writeFile(path, `# Superbuilder progress\n${lines.join("\n")}\n`, "utf8");
  }
}

function implementPrompt(s: UserStory): string {
  return [
    `# ${s.id} — ${s.title}`,
    "",
    "You are the implementer. Use only the smallest diff that satisfies the criteria below.",
    "",
    `Description: ${s.description}`,
    "",
    "Acceptance criteria:",
    ...s.acceptanceCriteria.map((c) => `- ${c}`),
    "",
    "Files likely touched:",
    ...s.filesLikelyTouched.map((f) => `- ${f}`),
    "",
    "Hard rules: no force push, no publish, no deploy, no .env writes, no dependency adds without approval, no Claude attribution in commits.",
    "",
    `Before declaring done, write your branch's diff to \`.superbuilder/evidence/${s.id}/diff.patch\` (e.g. \`git diff <integration>...HEAD > <path>\`) so evidence capture works even if the host process is not on this branch.`,
    "",
  ].join("\n");
}

function verifyPrompt(s: UserStory): string {
  return [
    `# Verify ${s.id}`,
    "",
    "Run all relevant gates for this story's risk level. Capture logs, screenshots, axe reports as appropriate. Story passes only if all relevant gates produce evidence.",
    "",
    `Acceptance criteria to verify behaviorally:`,
    ...s.acceptanceCriteria.map((c) => `- ${c}`),
  ].join("\n");
}

function reviewPrompt(s: UserStory): string {
  return [
    `# Review ${s.id}`,
    "",
    "Five-axis review: correctness, readability, architecture, security (quick), performance. Block on hidden complexity, missing acceptance-criteria coverage, or speculative abstractions. Write the report to .superbuilder/evidence/<US>/review.md.",
  ].join("\n");
}

export async function loadProgress(root: string): Promise<string> {
  const path = join(root, "progress.md");
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}
