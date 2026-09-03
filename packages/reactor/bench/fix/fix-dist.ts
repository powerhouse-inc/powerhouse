import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";
import { RecordsError } from "../records/jsonl-store.js";
import type { CommandResult } from "../records/records-commands.js";
import { FIX_EXIT } from "./fix-options.js";
import type { DistCheckOptions } from "./fix-options.js";
import { repoRoot } from "./repo.js";

export type WorkspacePackage = { name: string; path: string };

export type Newest = { mtimeMs: number; file: string };

export type DistVerdict = "fresh" | "stale" | "no-dist" | "no-build";

export type DistStatus = {
  name: string;
  path: string;
  verdict: DistVerdict;
  newestSource: Newest | undefined;
  newestDist: Newest | undefined;
};

/**
 * Directories that never feed a build, so a touch inside them is not
 * staleness. Dot-directories are skipped too, and package.json and tsconfig
 * are not source: a version bump touches every one of them at once.
 */
export const SOURCE_SKIP_DIRS = new Set([
  "dist",
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "e2e",
  "bench",
  "coverage",
  "storybook-static",
  ".turbo",
  ".tsbuild",
  ".git",
]);

export function isSourceFile(relativePath: string): boolean {
  if (/\.(test|spec|bench)\.[cm]?[jt]sx?$/.test(relativePath)) {
    return false;
  }
  if (/(^|\/)(package\.json|tsconfig[^/]*\.json)$/.test(relativePath)) {
    return false;
  }
  if (/\.d\.[cm]?ts$/.test(relativePath)) {
    return false;
  }
  return /\.([cm]?[jt]sx?|json|graphql|css|scss|html)$/.test(relativePath);
}

/**
 * Declarations do not count: tsc --build refreshes .d.ts under dist without
 * regenerating the JS, which is the exact false-fresh this check exists for.
 */
export function isRuntimeDistFile(relativePath: string): boolean {
  return /\.[cm]?js$/.test(relativePath) && !relativePath.endsWith(".map");
}

export function newestFile(
  directory: string,
  include: (relativePath: string) => boolean,
  skipDirs: Set<string>,
): Newest | undefined {
  let newest: Newest | undefined;
  const visit = (current: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name) && !entry.name.startsWith(".")) {
          visit(path);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const rel = relative(directory, path);
      if (!include(rel)) {
        continue;
      }
      const mtimeMs = statSync(path).mtimeMs;
      if (newest === undefined || mtimeMs > newest.mtimeMs) {
        newest = { mtimeMs, file: rel };
      }
    }
  };
  visit(directory);
  return newest;
}

export function distVerdict(
  hasBuild: boolean,
  newestSource: Newest | undefined,
  newestDist: Newest | undefined,
): DistVerdict {
  if (!hasBuild) {
    return "no-build";
  }
  if (newestDist === undefined) {
    return "no-dist";
  }
  if (newestSource === undefined) {
    return "fresh";
  }
  return newestSource.mtimeMs > newestDist.mtimeMs ? "stale" : "fresh";
}

export function listWorkspacePackages(root: string): WorkspacePackage[] {
  let raw: string;
  try {
    raw = execFileSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw new RecordsError(
      `Could not list workspace packages: ${error instanceof Error ? error.message : String(error)}`,
      FIX_EXIT.error,
    );
  }
  const parsed = JSON.parse(raw) as { name?: string; path?: string }[];
  return parsed
    .filter(
      (entry): entry is WorkspacePackage =>
        typeof entry.name === "string" && typeof entry.path === "string",
    )
    .filter((entry) => entry.path !== root)
    .map((entry) => ({ name: entry.name, path: entry.path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hasBuildScript(packagePath: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(join(packagePath, "package.json"), "utf8");
  } catch {
    return false;
  }
  const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
  return typeof parsed.scripts?.build === "string";
}

export function checkPackage(pkg: WorkspacePackage): DistStatus {
  const hasBuild = hasBuildScript(pkg.path);
  const distPath = join(pkg.path, "dist");
  const newestSource = hasBuild
    ? newestFile(pkg.path, isSourceFile, SOURCE_SKIP_DIRS)
    : undefined;
  const newestDist =
    hasBuild && existsSync(distPath)
      ? newestFile(distPath, isRuntimeDistFile, new Set(["node_modules"]))
      : undefined;
  return {
    name: pkg.name,
    path: pkg.path,
    verdict: distVerdict(hasBuild, newestSource, newestDist),
    newestSource,
    newestDist,
  };
}

export type MarkerHit = { name: string; files: string[] };

export function findMarker(pkg: WorkspacePackage, marker: string): MarkerHit {
  const distPath = join(pkg.path, "dist");
  const files: string[] = [];
  const visit = (current: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      const rel = relative(pkg.path, path);
      if (!isRuntimeDistFile(rel)) {
        continue;
      }
      if (readFileSync(path, "utf8").includes(marker)) {
        files.push(rel);
      }
    }
  };
  visit(distPath);
  return { name: pkg.name, files };
}

function stamp(newest: Newest | undefined): string {
  return newest === undefined
    ? "-"
    : `${new Date(newest.mtimeMs).toISOString()} ${newest.file}`;
}

export function formatDistStatus(status: DistStatus): string {
  return `${status.verdict.toUpperCase().padEnd(8)} ${status.name}  src ${stamp(status.newestSource)}  dist ${stamp(status.newestDist)}`;
}

export function runDistCheck(options: DistCheckOptions): CommandResult {
  const root = repoRoot();
  let packages = listWorkspacePackages(root);
  if (options.pkg !== "") {
    packages = packages.filter(
      (pkg) => pkg.name === options.pkg || pkg.name.endsWith(`/${options.pkg}`),
    );
    if (packages.length === 0) {
      throw new RecordsError(
        `No workspace package named ${options.pkg}`,
        FIX_EXIT.notFound,
      );
    }
  }

  const statuses = packages.map(checkPackage);
  const stale = statuses.filter((status) => status.verdict === "stale");
  const lines = statuses
    .filter((status) => status.verdict !== "no-build")
    .map(formatDistStatus);
  lines.push(
    stale.length === 0
      ? `dist: every built package is newer than its source`
      : `dist: ${String(stale.length)} STALE: ${stale.map((status) => status.name).join(", ")}; rebuild with pnpm ${stale.map((status) => `--filter=${status.name}`).join(" ")} run build`,
  );

  let markerMissing = false;
  const markers: MarkerHit[] = [];
  if (options.marker !== "") {
    for (const pkg of packages) {
      if (!existsSync(join(pkg.path, "dist"))) {
        continue;
      }
      const hit = findMarker(pkg, options.marker);
      markers.push(hit);
      if (hit.files.length > 0) {
        lines.push(
          `marker ${JSON.stringify(options.marker)} in ${pkg.name}: ${hit.files.join(", ")}`,
        );
      }
    }
    if (markers.every((hit) => hit.files.length === 0)) {
      markerMissing = true;
      lines.push(
        `marker ${JSON.stringify(options.marker)}: MISSING from every runtime dist checked; the dist does not contain the edit`,
      );
    }
  }

  return {
    exit: stale.length > 0 || markerMissing ? FIX_EXIT.stale : FIX_EXIT.ok,
    lines,
    data: {
      stale: stale.map((status) => status.name),
      statuses,
      marker: options.marker,
      markers,
    },
  };
}
