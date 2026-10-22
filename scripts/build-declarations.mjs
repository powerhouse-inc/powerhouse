// Builds the TypeScript project-reference outputs (.tsbuild) that the dist
// builds' declaration emit reads. Run before any tsdown build.
//
// Why: tsconfig.options.json sets `composite` and `customConditions:
// ["source"]`, so a workspace import resolves to the referenced project's
// source and TypeScript substitutes that project's .tsbuild declarations.
// tsdown's tsgo dts pass (`tsgo -p … --noCheck`) does not build references,
// so without .tsbuild every inferred cross-package type is emitted as `any`
// (e.g. clint's `declaredHostSchema: any`) and ships that way.
//
// Usage: node scripts/build-declarations.mjs [package-name ...]
// With no names: every package the root `build` script builds. With names
// (a filtered CI setup): those of them the root `build` script builds.
// `tsc --build` is incremental, so a later `pnpm typecheck` reuses the work.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

const buildScript = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  .scripts.build;
const built = [...buildScript.matchAll(/--filter=(\S+)/g)].map((m) => m[1]);
const wanted = process.argv.slice(2);
const names = wanted.length
  ? built.filter((name) => wanted.includes(name))
  : built;
if (names.length === 0) process.exit(0);

// pnpm is a .cmd shim on Windows, which Node only spawns through a shell.
const ls = spawnSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: isWindows,
});
if (ls.status !== 0) {
  process.stderr.write(ls.stderr);
  process.exit(ls.status ?? 1);
}
const dirs = new Map(JSON.parse(ls.stdout).map((p) => [p.name, p.path]));
const projects = names
  .map((name) => dirs.get(name))
  .filter((dir) => dir && existsSync(join(dir, "tsconfig.json")));

const tsc = join(
  dirname(
    createRequire(join(root, "package.json")).resolve(
      "typescript/package.json",
    ),
  ),
  "bin",
  "tsc",
);
console.log(`tsc --build: ${projects.length} projects`);
const run = spawnSync(process.execPath, [tsc, "--build", ...projects], {
  cwd: root,
  stdio: "inherit",
});
if (run.error) throw run.error;
process.exit(run.status ?? 1);
