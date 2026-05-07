// Superbuilder orchestrator entry point. Routes CLI verbs to handlers.
// Verbs: run | heal | sources | validate

import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { loadPRD } from "./prd.js";
import { run as runScheduler } from "./scheduler.js";
import type { Provider } from "./sandcastle-runner.js";
import { runAudit } from "./source-audit.js";

const HELP = `
Usage: superbuilder-orchestrator <verb> [options]

Verbs:
  run         Iterate stories from .superbuilder/prd.json through Sandcastle + gates
  heal        Run a single self-heal experiment (writes EXP-NNN.json)
  sources     Audit upstream source repos (writes AUDIT-<ts>.md)
  validate    Validate the PRD JSON structure and print errors

Common options:
  --root <path>        Path to .superbuilder dir (default: ./.superbuilder)
  --project <path>     Project root the orchestrator operates on (default: cwd)
  --provider <name>    Sandcastle provider: docker (default) | podman | vercel
  --dry-run            Skip Sandcastle agent runs; only run gates against current code
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
    },
    allowPositionals: true,
    strict: false,
  });

  const root = resolve(String(values.root ?? ".superbuilder"));
  const projectRoot = resolve(String(values.project ?? process.cwd()));
  const provider = (String(values.provider ?? "docker")) as Provider;
  const dryRun = Boolean(values["dry-run"]);

  if (!existsSync(root)) {
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
    case "heal":
      // The heal flow still lives in its slash command and skill today.
      console.error(
        `'heal' is exposed as the slash command /superbuilder:superheal. ` +
          `The agent invokes the corresponding skill; this CLI verb is reserved for future automation.`,
      );
      return 64;
    default:
      console.error(`Unknown verb: ${verb}\n\n${HELP}`);
      return 64;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error((err as Error).stack ?? String(err));
    process.exit(1);
  },
);
