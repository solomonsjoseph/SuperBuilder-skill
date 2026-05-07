// Superbuilder orchestrator entry point. Routes CLI verbs to handlers.
// Verbs: run | heal | sources | validate

import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadPRD } from "./prd.js";
import { run as runScheduler } from "./scheduler.js";
import type { Provider } from "./sandcastle-runner.js";
import { runAudit } from "./source-audit.js";
import { runEval, defaultFixtureDir } from "./eval-runner.js";
import type { EvalResult, EvalSet } from "./eval-runner.js";

const HELP = `
Usage: superbuilder-orchestrator <verb> [options]

Verbs:
  run         Iterate stories from .superbuilder/prd.json through Sandcastle + gates
  heal        Run a self-heal experiment (writes .superbuilder/experiments/EXP-NNN.json)
  sources     Audit upstream source repos (writes AUDIT-<ts>.md)
  validate    Validate the PRD JSON structure and print errors

Common options:
  --root <path>        Path to .superbuilder dir (default: ./.superbuilder)
  --project <path>     Project root the orchestrator operates on (default: cwd)
  --provider <name>    Sandcastle provider: docker (default) | podman | vercel
  --dry-run            Skip Sandcastle agent runs; only run gates against current code

Heal options:
  --baseline-set <A|B>      Eval task set to run (default: B)
  --fixture-dir <path>      Set A fixture (default: <plugin>/examples/eval-fixture)
  --mutation <patch-file>   Optional mutation; applied via 'git apply' in cwd before
                            measurement and reverted with 'git apply -R' after.
  --experiments-dir <path>  Where to write EXP-NNN.json (default: ./.superbuilder/experiments)
  --problem <text>          Free-form problemStatement text for the experiment log
`.trim();

async function main(argv: string[]): Promise<number> {
  const verb = argv[0];
  const rest = argv.slice(1);
  if (!verb || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return 0;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      root: { type: "string" },
      project: { type: "string" },
      provider: { type: "string" },
      "dry-run": { type: "boolean" },
      "baseline-set": { type: "string" },
      "fixture-dir": { type: "string" },
      mutation: { type: "string" },
      "experiments-dir": { type: "string" },
      problem: { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  const root = resolve(String(values.root ?? ".superbuilder"));
  const projectRoot = resolve(String(values.project ?? process.cwd()));
  const provider = (String(values.provider ?? "docker")) as Provider;
  const dryRun = Boolean(values["dry-run"]);

  // 'heal' operates on its own fixture and doesn't require the host project
  // to have a .superbuilder/ — gate that check on the verb.
  if (verb !== "heal" && !existsSync(root)) {
    console.error(`Missing ${root}. Run /superbuilder:superbuild to create it.`);
    return 2;
  }

  switch (verb) {
    case "run": {
      const store = await loadPRD(root);
      const report = await runScheduler({ root, projectRoot, provider, dryRun }, store);
      console.log(JSON.stringify({ ok: true, report }, null, 2));
      return report.storiesFailed.length === 0 ? 0 : 1;
    }
    case "validate": {
      try {
        await loadPRD(root);
        console.log("PRD valid.");
        return 0;
      } catch (e) {
        console.error((e as Error).message);
        return 1;
      }
    }
    case "sources": {
      const lockPath = join(root, "source-lock.json");
      if (!existsSync(lockPath)) {
        console.error(`Missing ${lockPath}. Run /superbuilder:supersources to bootstrap.`);
        return 2;
      }
      const outputDir = join(root, "source-audits");
      const results = await runAudit({ sourceLockPath: lockPath, outputDir });
      const errored = results.filter((r) => r.error);
      console.log(JSON.stringify({ ok: errored.length === 0, results }, null, 2));
      if (errored.length > 0) {
        console.error(
          `Source audit completed with ${errored.length} error(s). Report still written to ${outputDir}/.`,
        );
        return 1;
      }
      return 0;
    }
    case "heal": {
      const setRaw = String(values["baseline-set"] ?? "B").toUpperCase();
      if (setRaw !== "A" && setRaw !== "B") {
        console.error(`--baseline-set must be A or B (got ${setRaw}).`);
        return 64;
      }
      const taskSet = setRaw as EvalSet;
      const fixtureDir = values["fixture-dir"]
        ? resolve(String(values["fixture-dir"]))
        : defaultFixtureDir();
      const experimentsDir = resolve(
        String(values["experiments-dir"] ?? join(root, "experiments")),
      );
      const problem = values.problem
        ? String(values.problem)
        : "baseline-only run (no mutation supplied)";
      const mutationPath = values.mutation
        ? resolve(String(values.mutation))
        : null;

      const log: string[] = [`${ts()} heal: start set=${taskSet}`];

      // 1. Apply mutation (if any) with --check first.
      let mutationApplied = false;
      if (mutationPath) {
        if (!existsSync(mutationPath)) {
          console.error(`--mutation file not found: ${mutationPath}`);
          return 64;
        }
        const check = spawnSync(
          "git",
          ["apply", "--check", mutationPath],
          { cwd: process.cwd(), encoding: "utf8" },
        );
        if (check.status !== 0) {
          console.error(
            `git apply --check failed for ${mutationPath}:\n${check.stderr ?? ""}`,
          );
          return 1;
        }
        const apply = spawnSync(
          "git",
          ["apply", mutationPath],
          { cwd: process.cwd(), encoding: "utf8" },
        );
        if (apply.status !== 0) {
          console.error(
            `git apply failed for ${mutationPath}:\n${apply.stderr ?? ""}`,
          );
          return 1;
        }
        mutationApplied = true;
        log.push(`${ts()} heal: mutation applied from ${mutationPath}`);
      }

      let result: EvalResult;
      try {
        // For "baseline-only" runs the brief specifies scoreBefore == scoreAfter.
        // We measure ONCE and use that number for both. When a mutation is
        // applied, scoreAfter reflects post-mutation; scoreBefore is left equal
        // to scoreAfter (TODO: a future iteration will run pre+post).
        result = await runEval({ taskSet, fixtureDir });
        log.push(
          `${ts()} heal: eval complete metrics=${JSON.stringify(result.metrics)}`,
        );
      } catch (err) {
        if (mutationApplied && mutationPath) {
          spawnSync("git", ["apply", "-R", mutationPath], {
            cwd: process.cwd(),
            encoding: "utf8",
          });
          log.push(`${ts()} heal: mutation reverted after error`);
        }
        throw err;
      }

      // 2. Revert mutation.
      if (mutationApplied && mutationPath) {
        const revert = spawnSync(
          "git",
          ["apply", "-R", mutationPath],
          { cwd: process.cwd(), encoding: "utf8" },
        );
        if (revert.status !== 0) {
          console.error(
            `WARNING: failed to revert mutation ${mutationPath}:\n${revert.stderr ?? ""}`,
          );
          log.push(`${ts()} heal: WARNING mutation revert failed`);
        } else {
          log.push(`${ts()} heal: mutation reverted`);
        }
      }

      // 3. Decide keep/revert per docs/EVALS.md.
      const targetMetric = taskSet === "B" ? "securityBlockSuccess" : "storyPassRate";
      const baselineMetric =
        taskSet === "B"
          ? result.metrics.securityBlockSuccess ?? 0
          : result.metrics.storyPassRate ?? 0;
      const scoreBefore = baselineMetric;
      const scoreAfter = baselineMetric;
      const safetyOk =
        (result.metrics.securityBlockSuccess ?? 1) >= 1.0;
      const falsePassOk = result.metrics.falsePassRate === 0;
      const decision: "keep" | "revert" =
        safetyOk && falsePassOk ? "keep" : "revert";

      // 4. Write EXP-NNN.json.
      mkdirSync(experimentsDir, { recursive: true });
      const expId = nextExperimentId(experimentsDir);
      const experiment = {
        id: expId,
        createdAt: new Date().toISOString(),
        problemStatement: problem,
        targetMetric,
        baselineMetric,
        editableSurface: mutationPath ?? "(baseline-only)",
        mutation: mutationPath
          ? {
              summary: `mutation supplied via ${mutationPath}`,
              diff: mutationPath,
            }
          : null,
        evalTaskSet: taskSet,
        scoreBefore,
        scoreAfter,
        regressionCount: 0,
        safetyRegression: safetyOk ? "none" : "set-B-block-success-below-1.0",
        decision,
        falsePassRate: result.metrics.falsePassRate,
        result,
        log,
      };
      const expPath = join(experimentsDir, `${expId}.json`);
      await writeFile(expPath, JSON.stringify(experiment, null, 2) + "\n", "utf8");
      log.push(`${ts()} heal: wrote ${expPath}`);

      // Print the result JSON to stdout per the brief.
      console.log(JSON.stringify(experiment, null, 2));
      return decision === "keep" ? 0 : 1;
    }
    default:
      console.error(`Unknown verb: ${verb}\n\n${HELP}`);
      return 64;
  }
}

function ts(): string {
  return new Date().toISOString();
}

function nextExperimentId(dir: string): string {
  let max = 0;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^EXP-(\d+)\.json$/.exec(f);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
  }
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error((err as Error).stack ?? String(err));
    process.exit(1);
  },
);
