import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectPackageManager } from "./package-manager.js";

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pm-"));
}

describe("detectPackageManager", () => {
  it("detects pnpm via pnpm-lock.yaml only", async () => {
    const dir = await tmp();
    await writeFile(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });

  it("detects yarn via yarn.lock only", async () => {
    const dir = await tmp();
    await writeFile(join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir)).toBe("yarn");
  });

  it("detects npm via package-lock.json only", async () => {
    const dir = await tmp();
    await writeFile(join(dir, "package-lock.json"), "{}");
    expect(detectPackageManager(dir)).toBe("npm");
  });

  it("returns 'unknown' with no lockfiles or package.json", async () => {
    const dir = await tmp();
    expect(detectPackageManager(dir)).toBe("unknown");
  });

  it("uses package.json#packageManager even if no lockfile", async () => {
    const dir = await tmp();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ packageManager: "pnpm@8.0.0" }),
    );
    expect(detectPackageManager(dir)).toBe("pnpm");
  });

  it("multiple lockfiles: resolves to whichever is newer", async () => {
    const dir = await tmp();
    const yarnLock = join(dir, "yarn.lock");
    const pnpmLock = join(dir, "pnpm-lock.yaml");
    await writeFile(yarnLock, "");
    await writeFile(pnpmLock, "");
    // make pnpm newer than yarn explicitly
    const olderTime = new Date(Date.now() - 60_000);
    const newerTime = new Date();
    await utimes(yarnLock, olderTime, olderTime);
    await utimes(pnpmLock, newerTime, newerTime);
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
});
