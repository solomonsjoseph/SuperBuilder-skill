import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { QualityGates, UserStory } from "./types.js";

export type GateName = keyof QualityGates;

export interface GateResult {
  gate: GateName;
  command: string | null;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  durationMs: number;
  evidencePath: string;
}

const RELEVANT_PER_RISK: Record<UserStory["riskLevel"], GateName[]> = {
  low: ["typecheck", "lint", "format", "test", "secretScan"],
  medium: [
    "typecheck", "lint", "format", "test", "integrationTest",
    "secretScan", "dependencyAudit", "licenseCheck",
  ],
  high: [
    "typecheck", "lint", "format", "test", "integrationTest",
    "security", "secretScan", "dependencyAudit", "licenseCheck",
    "browser", "accessibility", "performance",
  ],
};

export function relevantGates(story: UserStory): GateName[] {
  return RELEVANT_PER_RISK[story.riskLevel];
}

export async function runGate(
  gate: GateName,
  command: string | null,
  evidenceDir: string,
): Promise<GateResult> {
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${gate}.log`);

  if (!command) {
    await writeFile(
      join(evidenceDir, `${gate}.skipped.md`),
      `Gate ${gate} skipped: no command configured in qualityGates.\n`,
    );
    return { gate, command: null, status: "skipped", exitCode: null, durationMs: 0, evidencePath };
  }

  const started = Date.now();
  const result = await runShell(command, evidencePath);
  return {
    gate,
    command,
    status: result.exitCode === 0 ? "passed" : "failed",
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    evidencePath,
  };
}

function runShell(command: string, logPath: string): Promise<{ exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], { stdio: ["ignore", "pipe", "pipe"] });
    const stream = createWriteStream(logPath, { flags: "w" });
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    child.on("close", (code) => {
      stream.end();
      resolve({ exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      stream.write(`\n[orchestrator] failed to spawn: ${err.message}\n`);
      stream.end();
      resolve({ exitCode: 1 });
    });
  });
}
