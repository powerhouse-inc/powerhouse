// Decides which of the `test:ci` packages a diff can affect: map each changed
// file to its owning workspace package, expand to dependents, intersect.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

// Changes whose effect no dependency graph can see: they alter what gets
// installed, how anything compiles, or how the suites themselves are selected.
const FULL_RUN_PATTERNS = [
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /(^|\/)package\.json$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.config\.[^/]+$/,
  /^\.github\/workflows\//,
  /^\.github\/actions\//,
  /^scripts\/test-(shard\.ts|weights\.json)$/,
  /^packages\/shared\/clis\/build-config/,
];

// Parsed from the `test:ci` script so the package list has one source of truth.
function testCiPackages() {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const script = pkg.scripts["test:ci"];
  if (!script) throw new Error("root package.json has no test:ci script");
  return new Set(
    script.match(/--filter=(\S+)/g).map((f) => f.slice("--filter=".length)),
  );
}

// Longest dir first, so packages/analytics-engine/core wins over a shorter
// prefix when a file is matched against it.
function workspacePackages() {
  const json = execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(json)
    .map((p) => [path.relative(repoRoot, p.path), p.name])
    .filter(([dir]) => dir !== "")
    .sort((a, b) => b[0].length - a[0].length);
}

// pnpm's `...{<dir>}` selector: the packages that depend on `dirs`, plus `dirs`.
function dependentsOf(dirs) {
  const filters = dirs.flatMap((dir) => ["--filter", `...{./${dir}}`]);
  const json = execFileSync(
    "pnpm",
    ["list", "--depth", "-1", "--json", ...filters],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return new Set(JSON.parse(json).map((p) => p.name));
}

const changed = process.argv.slice(2).filter(Boolean);

if (changed.length === 0) {
  console.log("mode=none");
  process.exit(0);
}

const forcesFull = changed.find((file) =>
  FULL_RUN_PATTERNS.some((re) => re.test(file)),
);
if (forcesFull) {
  console.error(
    `Full test:ci: "${forcesFull}" is infrastructure the module graph cannot see.`,
  );
  console.log("mode=full");
  process.exit(0);
}

const packages = workspacePackages();
const ownerDirs = new Set();
const unowned = [];
for (const file of changed) {
  const owner = packages.find(
    ([dir]) => file === dir || file.startsWith(`${dir}/`),
  );
  if (owner) ownerDirs.add(owner[0]);
  else unowned.push(file);
}

// Files outside every workspace package -- docs, plan/, tools/, editor config
// -- are exactly what this step exists to skip, so they select nothing.
if (unowned.length > 0) {
  console.error(
    `Owned by no workspace package (ignored): ${unowned.join(" ")}`,
  );
}

if (ownerDirs.size === 0) {
  console.error("No workspace package owns any changed file; nothing to test.");
  console.log("mode=none");
  process.exit(0);
}

const allowed = testCiPackages();
const affected = [...dependentsOf([...ownerDirs])]
  .filter((name) => allowed.has(name))
  .sort();

console.error(`Changed packages: ${[...ownerDirs].sort().join(" ")}`);
console.error(
  `Affected test:ci packages (${affected.length}/${allowed.size}): ${affected.join(" ") || "(none)"}`,
);

if (affected.length === 0) {
  console.log("mode=none");
} else if (affected.length === allowed.size) {
  // No narrowing to be had, and `test:ci` is the shape the logs already show.
  console.log("mode=full");
} else {
  console.log("mode=affected");
  console.log(
    `filters=${affected.map((name) => `--filter=${name}`).join(" ")}`,
  );
}
