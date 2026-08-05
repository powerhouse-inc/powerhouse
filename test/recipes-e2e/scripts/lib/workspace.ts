import fs from "node:fs";
import path from "node:path";

export interface PackageInfo {
  name: string;
  dir: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

function readPackageJson(dir: string): PackageInfo | undefined {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (!raw.name) return undefined;
    return {
      name: raw.name,
      dir,
      scripts: raw.scripts ?? {},
      dependencies: raw.dependencies ?? {},
      devDependencies: raw.devDependencies ?? {},
    };
  } catch {
    return undefined;
  }
}

/**
 * Expand the `packages:` globs from a pnpm-workspace.yaml. Only the two shapes
 * this repo and the recipes repo actually use are handled — a literal path and
 * a single trailing `*` — because pulling in a glob library for two cases isn't
 * worth the dependency. `!`-prefixed exclusions are dropped.
 */
function workspaceGlobs(root: string): string[] {
  const file = path.join(root, "pnpm-workspace.yaml");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf-8").split("\n");
  const globs: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = /^\s+-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
      if (match) {
        globs.push(match[1]);
        continue;
      }
      // A non-indented, non-empty line ends the packages block.
      if (line.trim() !== "" && !/^\s/.test(line)) inPackages = false;
    }
  }
  return globs.filter((g) => !g.startsWith("!"));
}

/** Every package in a pnpm workspace, keyed by nothing — order follows the globs. */
export function findWorkspacePackages(root: string): PackageInfo[] {
  const found: PackageInfo[] = [];
  const seen = new Set<string>();

  const add = (dir: string) => {
    const abs = path.resolve(root, dir);
    if (seen.has(abs)) return;
    seen.add(abs);
    const info = readPackageJson(abs);
    if (info) found.push(info);
  };

  for (const glob of workspaceGlobs(root)) {
    if (!glob.endsWith("/*")) {
      add(glob);
      continue;
    }
    const parent = path.resolve(root, glob.slice(0, -2));
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        add(path.join(parent, entry.name));
      }
    }
  }
  return found;
}

/**
 * The recipes repo's own root `start` script is the source of truth for which
 * demos never exit — it excludes them with `--filter '!<name>'`. Parsing it
 * keeps this runner in sync when a recipe is added or reclassified, instead of
 * duplicating the list here and letting it rot.
 */
export function parseNonExitingStarts(recipesRoot: string): string[] {
  const info = readPackageJson(recipesRoot);
  const start = info?.scripts.start;
  if (!start) return [];
  return [...start.matchAll(/--filter\s+['"]?!([^'"\s]+)['"]?/g)].map(
    (m) => m[1],
  );
}
