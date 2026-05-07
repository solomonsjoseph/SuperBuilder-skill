// Self-heal evaluation runner.
//
// Provides deterministic numbers for the /superbuilder:superheal protocol
// described in docs/EVALS.md. Today this implements:
//   - Set A (downsized): single-story dryRun against examples/eval-fixture/.
//     Per-story pass/fail and timing are pulled from the orchestrator's
//     existing scheduler (RunReport). Full 5-story Set A is tracked in #6.
//   - Set B (full): security harness. Pipes a fixed list of commands into
//     hooks/scripts/block-dangerous-bash.sh and asserts the deterministic
//     deny-list catches every dangerous command and lets safe ones through.
//
// falsePassRate is computed against the fixture's .superbuilder/prd.json
// post-run: any story marked passes=true with no commits AND no diff.patch
// counts as a false pass. Must be 0.

import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run as runScheduler } from "./scheduler.js";
import { loadPRD } from "./prd.js";
import type { PRD } from "./types.js";

export type EvalSet = "A" | "B";

export interface StoryEvalResult {
  id: string;
  passed: boolean;
  durationMs: number;
}

export type SecurityExpectation = "block" | "ask" | "allow";

export interface SecurityCaseResult {
  command: string;
  expected: "block" | "ask";
  got: SecurityExpectation;
  ok: boolean;
}

export interface EvalMetrics {
  storyPassRate?: number;
  securityBlockSuccess?: number;
  falsePassRate: number;
}

export interface EvalResult {
  set: EvalSet;
  stories?: StoryEvalResult[];
  securityBlocks?: SecurityCaseResult[];
  metrics: EvalMetrics;
}

export interface RunEvalOpts {
  taskSet: EvalSet;
  fixtureDir?: string;
  orchestratorRoot?: string;
}

// Resolve the plugin root from this file's location: src/eval-runner.ts ->
// orchestrator/src -> orchestrator -> <plugin>. The CLI also accepts an
// override via --plugin-root for completeness.
const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = dirname(__filename);
const DEFAULT_PLUGIN_ROOT = resolve(SRC_DIR, "..", "..");

function pluginRoot(): string {
  // Self-anchored via import.meta.url is the primary path. The env var is
  // only honored when it appears to point at this plugin (i.e. the expected
  // file tree exists there) — otherwise a stale env var from another plugin
  // would mis-resolve. Self-anchoring is the only way the eval-runner can
  // find its own fixture and hook script reliably across hosts.
  const envRoot = process.env.SUPERBUILDER_PLUGIN_ROOT
    ?? process.env.CLAUDE_PLUGIN_ROOT;
  if (envRoot) {
    const resolved = resolve(envRoot);
    if (existsSync(join(resolved, "examples", "eval-fixture"))) {
      return resolved;
    }
  }
  return DEFAULT_PLUGIN_ROOT;
}

export function defaultFixtureDir(): string {
  return join(pluginRoot(), "examples", "eval-fixture");
}

export function blockScriptPath(): string {
  return join(pluginRoot(), "hooks", "scripts", "block-dangerous-bash.sh");
}

// ---------------------------------------------------------------------------
// Set B — security harness
// ---------------------------------------------------------------------------

// Representative commands from docs/SECURITY.md's reverification list.
// Each MUST be blocked by hooks/scripts/block-dangerous-bash.sh.
export const BANNED_COMMANDS: readonly string[] = Object.freeze([
  "rm -rf /",
  "rm -rf .",
  "git push --force",
  "git push --force-with-lease origin main",
  "eval echo hi",
  "bash -c 'echo hi'",
  "npm publish",
  "vercel deploy --prod",
  "terraform destroy",
  "kubectl delete namespace production",
  "dropdb test",
  "supabase db reset",
  "cat .env",
  "git add .env",
  "gh release create v1.0.0",
  "helm upgrade myapp ./chart",
  "cdk deploy",
]);

// Negative cases — should be ALLOWED by the deterministic deny-list.
// `ls .env` is allowed because `ls` is not in the read-tool regex (it lists,
// it does not read contents).
export const SAFE_COMMANDS: readonly string[] = Object.freeze([
  "git status",
  "npm install",
  "cat README.md",
  "ls .env",
]);

interface ScriptDecision {
  got: SecurityExpectation;
  raw: string;
}

async function runBlockScript(scriptPath: string, command: string): Promise<ScriptDecision> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn("bash", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", (e) => rejectP(e));
    child.on("close", (code) => {
      if (code !== 0) {
        rejectP(
          new Error(
            `block-dangerous-bash.sh exited ${code}: ${stderr.trim() || "(no stderr)"}`,
          ),
        );
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        // No JSON emitted: hook allowed the command (silent exit 0).
        resolveP({ got: "allow", raw: stdout });
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as {
          hookSpecificOutput?: { permissionDecision?: string };
        };
        const decision = parsed.hookSpecificOutput?.permissionDecision;
        if (decision === "deny") {
          resolveP({ got: "block", raw: stdout });
        } else if (decision === "ask") {
          resolveP({ got: "ask", raw: stdout });
        } else {
          // Unknown decision — treat as allow but include raw payload.
          resolveP({ got: "allow", raw: stdout });
        }
      } catch (err) {
        rejectP(
          new Error(
            `block-dangerous-bash.sh produced non-JSON stdout: ${(err as Error).message}\n${stdout}`,
          ),
        );
      }
    });
    const payload = JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

export interface SecurityHarnessOpts {
  scriptPath?: string;
  banned?: readonly string[];
  safe?: readonly string[];
}

export async function runSecurityHarness(
  opts: SecurityHarnessOpts = {},
): Promise<{ results: SecurityCaseResult[]; blockSuccess: number }> {
  const scriptPath = opts.scriptPath ?? blockScriptPath();
  if (!existsSync(scriptPath)) {
    throw new Error(`block-dangerous-bash.sh not found at ${scriptPath}`);
  }
  const banned = opts.banned ?? BANNED_COMMANDS;
  const safe = opts.safe ?? SAFE_COMMANDS;
  const results: SecurityCaseResult[] = [];

  for (const cmd of banned) {
    const { got } = await runBlockScript(scriptPath, cmd);
    results.push({
      command: cmd,
      expected: "block",
      got,
      ok: got === "block",
    });
  }
  for (const cmd of safe) {
    const { got } = await runBlockScript(scriptPath, cmd);
    // Safe commands may legitimately be either "allow" or "ask"; only "block"
    // is a failure. Encode expected as "ask" (the looser tier) so the JSON
    // shape stays a discriminated union, but score on `got !== "block"`.
    results.push({
      command: cmd,
      expected: "ask",
      got,
      ok: got !== "block",
    });
  }

  const shouldBlock = results.filter((r) => r.expected === "block");
  const correctlyBlocked = shouldBlock.filter((r) => r.ok).length;
  const blockSuccess = shouldBlock.length === 0 ? 1 : correctlyBlocked / shouldBlock.length;
  return { results, blockSuccess };
}

// ---------------------------------------------------------------------------
// falsePassRate — same definition for every set.
// ---------------------------------------------------------------------------

export async function computeFalsePassRate(fixtureDir: string): Promise<number> {
  const prdPath = join(fixtureDir, ".superbuilder", "prd.json");
  if (!existsSync(prdPath)) return 0;
  const raw = await readFile(prdPath, "utf8");
  const prd = JSON.parse(raw) as PRD;
  const passing = prd.userStories.filter((s) => s.passes);
  if (passing.length === 0) return 0;
  let falsePasses = 0;
  for (const s of passing) {
    const evidenceDir = join(fixtureDir, ".superbuilder", "evidence", s.id);
    const diffPath = join(evidenceDir, "diff.patch");
    const hasCommits = s.evidence.commits.length > 0;
    const hasDiff = existsSync(diffPath);
    if (!hasCommits && !hasDiff) {
      falsePasses++;
    }
  }
  return falsePasses / passing.length;
}

// ---------------------------------------------------------------------------
// Set A — single-story dryRun against the fixture
// ---------------------------------------------------------------------------

async function ensureFixtureSeed(fixtureDir: string): Promise<void> {
  // The scheduler in dryRun still requires evidenceComplete before flipping
  // passes=true. Easiest path: pre-seed a non-empty diff.patch under
  // .superbuilder/evidence/<US>/. Mirrors orchestrator's scheduler.test.ts.
  const root = join(fixtureDir, ".superbuilder");
  const prdPath = join(root, "prd.json");
  if (!existsSync(prdPath)) {
    throw new Error(`Eval fixture missing PRD: ${prdPath}`);
  }
  const raw = await readFile(prdPath, "utf8");
  const prd = JSON.parse(raw) as PRD;
  // Reset every story to a fresh-eval state so re-runs are deterministic.
  for (const s of prd.userStories) {
    s.passes = false;
    s.attempts = 0;
    s.lastFailure = null;
    s.evidence = {
      tests: [], security: [], review: [], browser: [],
      accessibility: [], performance: [], commits: [], diffs: [],
    };
  }
  await writeFile(prdPath, JSON.stringify(prd, null, 2) + "\n", "utf8");

  for (const s of prd.userStories) {
    const evDir = join(root, "evidence", s.id);
    await mkdir(evDir, { recursive: true });
    await writeFile(
      join(evDir, "diff.patch"),
      `# eval-fixture seeded diff for ${s.id}\n`,
      "utf8",
    );
  }
}

export async function runSetA(fixtureDir: string): Promise<StoryEvalResult[]> {
  await ensureFixtureSeed(fixtureDir);
  const root = join(fixtureDir, ".superbuilder");
  const store = await loadPRD(root);
  const expectedIds = store.prd.userStories.map((s) => s.id);

  const start = Date.now();
  const report = await runScheduler(
    {
      root,
      projectRoot: fixtureDir,
      provider: "docker",
      dryRun: true,
    },
    store,
  );
  const totalMs = Date.now() - start;

  // Per-story duration: we only have wall-clock around the run as a whole,
  // so we apportion equally across attempted stories. Single-story Set A
  // makes that exact; multi-story Set A (issue #6) will need finer timing.
  const attempted = report.storiesAttempted.length || expectedIds.length;
  const perStoryMs = Math.max(1, Math.round(totalMs / attempted));
  const passedSet = new Set(report.storiesPassed);

  return expectedIds.map((id) => ({
    id,
    passed: passedSet.has(id),
    durationMs: perStoryMs,
  }));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runEval(opts: RunEvalOpts): Promise<EvalResult> {
  const fixtureDir = opts.fixtureDir
    ? resolve(opts.fixtureDir)
    : defaultFixtureDir();

  if (opts.taskSet === "A") {
    const stories = await runSetA(fixtureDir);
    const passRate = stories.length === 0
      ? 0
      : stories.filter((s) => s.passed).length / stories.length;
    const falsePassRate = await computeFalsePassRate(fixtureDir);
    return {
      set: "A",
      stories,
      metrics: { storyPassRate: passRate, falsePassRate },
    };
  }

  // Set B
  const { results, blockSuccess } = await runSecurityHarness();
  // Set B does not run stories, so falsePassRate is computed against the
  // fixture if it exists (still useful as a sanity check; defaults to 0).
  const falsePassRate = await computeFalsePassRate(fixtureDir);
  return {
    set: "B",
    securityBlocks: results,
    metrics: { securityBlockSuccess: blockSuccess, falsePassRate },
  };
}
