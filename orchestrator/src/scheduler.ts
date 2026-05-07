import { writeFile, mkdir, appendFile, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { PRD, UserStory } from "./types.js";
import { DEFAULT_CAPS } from "./types.js";
import { selectNextStory, savePRD, evidenceComplete } from "./prd.js";
import type { PRDStore } from "./prd.js";
import { runGate, relevantGates } from "./gates.js";
import type { GateResult } from "./gates.js";
import { createSandbox } from "./sandcastle-runner.js";
import type { Provider } from "./sandcastle-runner.js";

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

  let storiesRun = 0;
  while (true) {
    if (caps.fullRunStories !== null && storiesRun >= caps.fullRunStories) {
      report.notes.push(`Hit fullRunStories cap (${caps.fullRunStories}); stopping.`);
      break;
    }
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
          agent: "implementer",
          promptFile: join(promptDir, `${story.id}-implement.md`),
          maxIterations: 1,
        });
        if (!impl.ok) {
          story.lastFailure = `implement: ${impl.notes}`;
          await savePRD(store);
          continue;
        }
        const verify = await sandbox.run({
          name: `verify-${story.id}`,
          agent: "test-engineer",
          promptFile: join(promptDir, `${story.id}-verify.md`),
          maxIterations: 1,
        });
        if (!verify.ok) {
          story.lastFailure = `verify: ${verify.notes}`;
          await savePRD(store);
          continue;
        }
        const review = await sandbox.run({
          name: `review-${story.id}`,
          agent: "reviewer",
          promptFile: join(promptDir, `${story.id}-review.md`),
          maxIterations: 1,
        });
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
    for (const g of gates) {
      const cmd = store.prd.qualityGates[g];
      const result = await runGate(g, cmd, evidenceDir);
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
    const diffPath = join(evidenceDir, "diff.patch");
    if (failures.length === 0) {
      // Path A: host-side capture. Works only when the orchestrator process is on
      // the story branch (e.g. dryRun, or when Sandcastle's branch sync is verified).
      const integration = store.prd.integrationBranch;
      const commits = git(["log", "--format=%H", `${integration}..HEAD`], opts.projectRoot);
      if (commits) {
        story.evidence.commits.push(...commits.split("\n").filter(Boolean));
      }
      const diff = git(["diff", `${integration}...HEAD`], opts.projectRoot);
      if (diff) {
        await writeFile(diffPath, diff, "utf8");
        if (!story.evidence.diffs.includes(diffPath)) {
          story.evidence.diffs.push(diffPath);
        }
      }
      // Path B: sandbox/agent-emitted diff. If diff.patch already exists and is
      // non-empty (the implementer prompt was instructed to write it), record it.
      if (existsSync(diffPath)) {
        try {
          if (statSync(diffPath).size > 0 && !story.evidence.diffs.includes(diffPath)) {
            story.evidence.diffs.push(diffPath);
          }
        } catch {
          // ignore
        }
      }
      if (evidenceComplete(story, evidenceDir) && failures.length === 0) {
        story.passes = true;
        story.lastFailure = null;
        await savePRD(store);
        return true;
      }
    }
    story.lastFailure = failures.map((f) => `${f.gate} (exit ${f.exitCode})`).join("; ") || "evidence incomplete";
    await savePRD(store);
  }

  return false;
}

function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status === 0) return (r.stdout ?? "").trim();
  return "";
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
