import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type PackageManager =
  | "pnpm"
  | "yarn"
  | "npm"
  | "bun"
  | "poetry"
  | "uv"
  | "cargo"
  | "go"
  | "bundler"
  | "composer"
  | "unknown";

interface Lockfile {
  file: string;
  pm: PackageManager;
}

const LOCKFILES: Lockfile[] = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "package-lock.json", pm: "npm" },
  { file: "bun.lockb", pm: "bun" },
  { file: "bun.lock", pm: "bun" },
  { file: "poetry.lock", pm: "poetry" },
  { file: "uv.lock", pm: "uv" },
  { file: "Cargo.lock", pm: "cargo" },
  { file: "go.mod", pm: "go" },
  { file: "Gemfile.lock", pm: "bundler" },
  { file: "composer.lock", pm: "composer" },
];

export function detectPackageManager(projectRoot: string): PackageManager {
  // Prefer package.json#packageManager when present.
  const pkgPath = join(projectRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        packageManager?: string;
      };
      if (pkg.packageManager) {
        const name = pkg.packageManager.split("@")[0]?.toLowerCase();
        if (name === "pnpm" || name === "yarn" || name === "npm" || name === "bun") {
          return name;
        }
      }
    } catch {
      // fall through
    }
  }

  const present = LOCKFILES.filter((l) => existsSync(join(projectRoot, l.file)));
  if (!present.length) return "unknown";
  // If multiple, prefer the most recently modified.
  present.sort((a, b) => mtime(projectRoot, b.file) - mtime(projectRoot, a.file));
  return present[0]!.pm;
}

function mtime(root: string, file: string): number {
  try {
    return statSync(join(root, file)).mtimeMs;
  } catch {
    return 0;
  }
}

export function installCommand(pm: PackageManager): string | null {
  switch (pm) {
    case "pnpm": return "pnpm install --frozen-lockfile";
    case "yarn": return "yarn install --frozen-lockfile";
    case "npm":  return "npm ci";
    case "bun":  return "bun install --frozen-lockfile";
    case "poetry": return "poetry install --no-interaction";
    case "uv":   return "uv sync --frozen";
    case "cargo": return "cargo fetch";
    case "go":   return "go mod download";
    case "bundler": return "bundle install";
    case "composer": return "composer install --no-interaction";
    default: return null;
  }
}
