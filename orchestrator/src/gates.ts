import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { QualityGates, UserStory } from "./types.js";
import { ALLOWED_PROGRAMS, FORBIDDEN_TOKENS } from "./allow-list.js";

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

async function refuse(logPath: string, message: string): Promise<{ exitCode: number }> {
  await writeFile(logPath, `${message}\n`);
  return { exitCode: 1 };
}

function runShell(command: string, logPath: string): Promise<{ exitCode: number }> {
  const trimmed = command.trim();
  if (!trimmed || FORBIDDEN_TOKENS.test(trimmed)) {
    return refuse(
      logPath,
      "Refusing to run gate command: shell metacharacters present (allow-list violation)",
    );
  }
  const tokens = trimmed.split(/\s+/);
  const program = tokens[0] ?? "";
  const restArgs = tokens.slice(1);
  if (!program || !ALLOWED_PROGRAMS.has(program)) {
    return refuse(
      logPath,
      `Refusing to run gate command: program '${program}' not in allow-list (allow-list violation)`,
    );
  }

  return new Promise((resolve) => {
    const child = spawn(program, restArgs, { stdio: ["ignore", "pipe", "pipe"] as const });
    const stream = createWriteStream(logPath, { flags: "w" });
    child.stdout?.pipe(stream, { end: false });
    child.stderr?.pipe(stream, { end: false });
    child.on("close", (code: number | null) => {
      stream.end();
      resolve({ exitCode: code ?? 1 });
    });
    child.on("error", (err: Error) => {
      stream.write(`\n[orchestrator] failed to spawn: ${err.message}\n`);
      stream.end();
      resolve({ exitCode: 1 });
    });
  });
}
