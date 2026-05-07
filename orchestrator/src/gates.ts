import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { QualityGates, UserStory } from "./types.js";
import { ALLOWED_PROGRAMS, FORBIDDEN_TOKENS } from "./allow-list.js";

/**
 * Programs that can execute arbitrary project code and therefore require
 * explicit PRD opt-in via humanApprovalRequiredFor containing
 * "exec gate command" before runGate will spawn them.
 */
// HIGH_RISK_PROGRAMS must be a subset of ALLOWED_PROGRAMS: every entry here
// can only be reached after the opt-in check AND the ALLOWED_PROGRAMS check.
// Keep in sync: bun/tsx can execute arbitrary local TS/JS (same risk as node);
// dlx is the bun equivalent of npx.
export const HIGH_RISK_PROGRAMS = new Set([
  "npx", "pnpx", "bunx", "dlx",
  "node", "bun", "tsx",
  "make", "cargo", "deno",
]);

export type GateName = keyof QualityGates;

// Default per-gate wall-clock timeout. Five minutes is generous for typical
// test/lint/typecheck commands; long-running suites should configure their
// own wrapper script rather than block the orchestrator indefinitely.
export const GATE_TIMEOUT_MS = 5 * 60 * 1000;

export interface GateResult {
  gate: GateName;
  command: string | null;
  // "passed"  : program spawned, exit 0
  // "failed"  : program spawned, non-zero exit (real test/lint failure)
  // "errored" : misconfiguration — allow-list refusal, shell-meta refusal,
  //             ENOENT on spawn, or per-gate timeout. Distinguished from
  //             "failed" so operators know to fix configuration, not code.
  // "skipped" : no command configured for this gate.
  status: "passed" | "failed" | "errored" | "skipped";
  exitCode: number | null;
  durationMs: number;
  evidencePath: string;
  // Populated when status === "errored"; null otherwise. Used by the
  // scheduler to write a human-readable "gate misconfigured" lastFailure.
  reason: string | null;
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

type ShellOutcome =
  | { kind: "exited"; exitCode: number }
  | { kind: "errored"; reason: string };

export async function runGate(
  gate: GateName,
  command: string | null,
  evidenceDir: string,
  options: { timeoutMs?: number; allowedHighRisk?: boolean } = {},
): Promise<GateResult> {
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `${gate}.log`);

  if (!command) {
    await writeFile(
      join(evidenceDir, `${gate}.skipped.md`),
      `Gate ${gate} skipped: no command configured in qualityGates.\n`,
    );
    return {
      gate,
      command: null,
      status: "skipped",
      exitCode: null,
      durationMs: 0,
      evidencePath,
      reason: null,
    };
  }

  // Reject shell metacharacters first — before extracting the program token —
  // so a command like "node$(evil)" is caught here rather than silently
  // passing the HIGH_RISK_PROGRAMS check (whose token split would yield
  // "node$(evil)", which is NOT in the set).
  const trimmedCmd = command.trim();
  if (!trimmedCmd || FORBIDDEN_TOKENS.test(trimmedCmd)) {
    const reason = "Refusing to run gate command: shell metacharacters present (allow-list violation)";
    await writeFile(evidencePath, `${reason}\n`);
    return { gate, command, status: "errored", exitCode: null, durationMs: 0, evidencePath, reason };
  }

  // High-risk programs require explicit PRD opt-in.
  const tokens = trimmedCmd.split(/\s+/);
  const program = tokens[0] ?? "";
  if (HIGH_RISK_PROGRAMS.has(program) && options.allowedHighRisk !== true) {
    const reason = `high-risk gate program '${program}' requires humanApprovalRequiredFor: ["exec gate command"] in the PRD`;
    await writeFile(evidencePath, `${reason}\n`);
    return {
      gate,
      command,
      status: "errored",
      exitCode: null,
      durationMs: 0,
      evidencePath,
      reason,
    };
  }

  const started = Date.now();
  const outcome = await runShell(command, evidencePath, options.timeoutMs ?? GATE_TIMEOUT_MS);
  const durationMs = Date.now() - started;

  if (outcome.kind === "errored") {
    return {
      gate,
      command,
      status: "errored",
      exitCode: null,
      durationMs,
      evidencePath,
      reason: outcome.reason,
    };
  }
  return {
    gate,
    command,
    status: outcome.exitCode === 0 ? "passed" : "failed",
    exitCode: outcome.exitCode,
    durationMs,
    evidencePath,
    reason: null,
  };
}

async function refuse(logPath: string, message: string): Promise<ShellOutcome> {
  await writeFile(logPath, `${message}\n`);
  return { kind: "errored", reason: message };
}

async function runShell(command: string, logPath: string, timeoutMs: number): Promise<ShellOutcome> {
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

  // Write audit prelude before spawning so the log records exactly what ran.
  const auditLine = [
    `gate-audit: ${program} ${restArgs.join(" ")}`.trimEnd(),
    `gate-command: ${command.trim()}`,
    "",
  ].join("\n");
  // Note: fs.writeFile accepts 'flag' (singular); createWriteStream accepts
  // 'flags' (plural). Both spellings are correct per the Node.js API.
  await writeFile(logPath, auditLine, { flag: "w" });

  return new Promise((resolve) => {
    const child = spawn(program, restArgs, { stdio: ["ignore", "pipe", "pipe"] as const });
    // Open in append mode so the audit prelude written above is preserved.
    const stream = createWriteStream(logPath, { flags: "a" });
    child.stdout?.pipe(stream, { end: false });
    child.stderr?.pipe(stream, { end: false });

    let settled = false;
    let timedOut = false;
    const settle = (outcome: ShellOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.end();
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      stream.write(`\n[orchestrator] gate timed out after ${timeoutMs}ms; killing\n`);
      try {
        child.kill("SIGTERM");
        // Hard-stop in case SIGTERM is ignored.
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
        }, 1000).unref?.();
      } catch {
        // ignore
      }
      settle({
        kind: "errored",
        reason: `gate timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    timer.unref?.();

    child.on("close", (code: number | null) => {
      if (timedOut) return; // already settled
      settle({ kind: "exited", exitCode: code ?? 1 });
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timedOut) return;
      stream.write(`\n[orchestrator] failed to spawn: ${err.message}\n`);
      const reason = err.code === "ENOENT"
        ? `spawn ENOENT: '${program}' not found on PATH`
        : `spawn error: ${err.message}`;
      settle({ kind: "errored", reason });
    });
  });
}
