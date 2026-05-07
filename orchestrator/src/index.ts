// Superbuilder orchestrator entry point. Routes CLI verbs to handlers.
// Verbs: run | heal | sources | validate | gates

import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadPRD } from "./prd.js";
import { run as runScheduler } from "./scheduler.js";
import type { Provider } from "./sandcastle-runner.js";
import { runAudit } from "./source-audit.js";
import {
  runEval,
  defaultFixtureDir,
  decideKeepRevert,
} from "./eval-runner.js";
import type { EvalResult, EvalSet } from "./eval-runner.js";
import { runGate, relevantGates } from "./gates.js";
import type { GateName, GateResult } from "./gates.js";
import type { PRD, UserStory } from "./types.js";

const HELP = `
Usage: superbuilder-orchestrator <verb> [options]

Verbs:
  run         Iterate stories from .superbuilder/prd.json through Sandcastle + gates
  heal        Run a self-heal experiment (writes .superbuilder/experiments/EXP-NNN.json)
  sources     Audit upstream source repos (writes AUDIT-<ts>.md)
  validate    Validate the PRD JSON structure and print errors
  gates       Run quality gates for one story (argv-form spawn, allow-list enforced)

Common options:
  --root <path>        Path to .superbuilder dir (default: ./.superbuilder)
  --project <path>     Project root the orchestrator operates on (default: cwd)
  --provider <name>    Sandcastle provider: docker (default) | podman | vercel
  --dry-run            Skip Sandcastle agent runs; only run gates against current code

Gates options:
  <story-id>            Positional. Required.
  --root <path>         .superbuilder dir (default: ./.superbuilder)
  --project <path>      Project root (default: cwd)

Heal options:
  --baseline-set <A|B>      Eval task set to run (default: B)
  --fixture-dir <path>      Set A fixture (default: <plugin>/examples/eval-fixture)
  --mutation <patch-file>   Optional mutation; applied via 'git apply' in cwd before
                            measurement and reverted with 'git apply -R' after.
                            Only patches targeting files read at runtime each
                            invocation (e.g. fixture prd.json, hook scripts) will
                            actually change behavior between pre- and post-mutation
                            runs — orchestrator .ts/.js source is module-cached.
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

  const { values, positionals } = parseArgs({
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
  // 'gates' handles its own missing-root reporting (so the malicious-PRD test
  // case can still print a structured JSON error).
  if (verb !== "heal" && verb !== "gates" && !existsSync(root)) {
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
    case "gates": {
      // Replaces bin/superbuilder-gates' bash -c shell expansion with the
      // hardened argv-form runGate (allow-list + FORBIDDEN_TOKENS regex).
      // Reads the PRD raw — bypasses validate.ts on purpose so a malicious
      // PRD's gate command still reaches runGate's runtime refusal (the
      // actual security boundary). Emits one JSON record per gate to stdout.
      const storyId = positionals[0];
      if (!storyId) {
        console.error("Usage: superbuilder-orchestrator gates <story-id> [--root <dir>] [--project <dir>]");
        return 64;
      }
      const prdPath = join(root, "prd.json");
      if (!existsSync(prdPath)) {
        console.log(JSON.stringify({
          ok: false,
          storyId,
          error: `Missing ${prdPath}`,
          gates: [],
        }, null, 2));
        return 1;
      }
      let prd: PRD;
      try {
        prd = JSON.parse(readFileSync(prdPath, "utf8")) as PRD;
      } catch (e) {
        console.log(JSON.stringify({
          ok: false,
          storyId,
          error: `Invalid PRD JSON: ${(e as Error).message}`,
          gates: [],
        }, null, 2));
        return 1;
      }
      const story = (prd.userStories ?? []).find(
        (s: UserStory) => s.id === storyId,
      );
      if (!story) {
        console.log(JSON.stringify({
          ok: false,
          storyId,
          error: `Story ${storyId} not found in ${prdPath}`,
          gates: [],
        }, null, 2));
        return 1;
      }
      const evidenceDir = join(root, "evidence", storyId);
      mkdirSync(evidenceDir, { recursive: true });

      const gateNames: GateName[] = relevantGates(story);
      const results: GateResult[] = [];
      for (const g of gateNames) {
        const cmd = (prd.qualityGates?.[g] ?? null) as string | null;
        const result = await runGate(g, cmd, evidenceDir);
        results.push(result);
      }

      const summary = results.map((r) => ({
        gate: r.gate,
        status: r.status,
        exitCode: r.exitCode,
        evidencePath: r.evidencePath,
        reason: r.reason,
      }));
      const anyBad = results.some(
        (r) => r.status === "failed" || r.status === "errored",
      );
      console.log(JSON.stringify({
        ok: !anyBad,
        storyId,
        projectRoot,
        gates: summary,
      }, null, 2));
      return anyBad ? 1 : 0;
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
      const targetMetric = taskSet === "B" ? "securityBlockSuccess" : "storyPassRate";
      const metricFor = (r: EvalResult): number =>
        (taskSet === "B"
          ? r.metrics.securityBlockSuccess
          : r.metrics.storyPassRate) ?? 0;

      // Pre-flight: validate mutation patch with --check before measuring
      // anything (cheap; saves a wasted pre-eval if the patch is malformed).
      if (mutationPath && !existsSync(mutationPath)) {
        console.error(`--mutation file not found: ${mutationPath}`);
        return 64;
      }
      if (mutationPath) {
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
      }

      let resultBefore: EvalResult | null = null;
      let resultAfter: EvalResult;
      let mutationApplied = false;
      try {
        if (mutationPath) {
          // 1. Pre-mutation measurement.
          resultBefore = await runEval({ taskSet, fixtureDir });
          log.push(
            `${ts()} heal: pre-mutation eval metrics=${JSON.stringify(resultBefore.metrics)}`,
          );
          // 2. Apply mutation.
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
          // Note: mutations targeting the orchestrator's own .ts/.js source
          // won't change behavior between pre- and post-mutation runs in
          // this single Node process (module cache). Mutations should target
          // files re-read at runtime each call (fixture prd.json, hook
          // scripts spawned via bash).
        }
        // 3. Post-mutation (or baseline-only) measurement.
        resultAfter = await runEval({ taskSet, fixtureDir });
        log.push(
          `${ts()} heal: ${mutationPath ? "post-mutation" : "baseline-only"} eval metrics=${JSON.stringify(resultAfter.metrics)}`,
        );
      } finally {
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
      }

      const result = resultAfter;
      const scoreAfter = metricFor(resultAfter);
      const scoreBefore = resultBefore ? metricFor(resultBefore) : scoreAfter;
      const baselineMetric = scoreBefore;
      const securityBlockSuccess =
        resultAfter.metrics.securityBlockSuccess ?? 1;
      const falsePassRate = resultAfter.metrics.falsePassRate;
      const decision = decideKeepRevert({
        scoreBefore,
        scoreAfter,
        securityBlockSuccess,
        falsePassRate,
      });
      const safetyOk = securityBlockSuccess >= 1.0;
      const regressionCount = scoreAfter < scoreBefore ? 1 : 0;

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
        mode: mutationPath ? "pre-post" : "baseline-only",
        scoreBefore,
        scoreAfter,
        regressionCount,
        safetyRegression: safetyOk ? "none" : "set-B-block-success-below-1.0",
        decision,
        falsePassRate,
        resultBefore,
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
