// Split a script's package list (`test:ci`, or TEST_SHARD_SCRIPT) into balanced shards; run one.
// Usage: tsx scripts/test-shard.ts <shard> <total> | --print <total> | --selectors <shard> <total>

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = process.env.TEST_SHARD_SCRIPT || "test:ci";

// Balance hints only: a stale or missing entry costs balance, never coverage.
// `{ weight, parts }` splits a suite longer than one shard into vitest shards.
const WEIGHTS = JSON.parse(
  readFileSync(
    join(root, process.env.TEST_SHARD_WEIGHTS || "scripts/test-weights.json"),
    "utf8",
  ),
) as Record<string, number | { weight: number; parts: number }>;
const DEFAULT_WEIGHT = 5;

/** A package's whole suite, or vitest shard `part` of `parts` of it. */
type Suite = { name: string; weight: number; part?: number; parts?: number };

function suites(names: string[]): Suite[] {
  return names.flatMap((name) => {
    const entry = WEIGHTS[name] ?? DEFAULT_WEIGHT;
    if (typeof entry === "number") return [{ name, weight: entry }];
    return Array.from({ length: entry.parts }, (_, index) => ({
      name,
      weight: entry.weight / entry.parts,
      part: index + 1,
      parts: entry.parts,
    }));
  });
}

const label = (suite: Suite) =>
  suite.part === undefined
    ? suite.name
    : `${suite.name} (${suite.part}/${suite.parts})`;

// Read from the script so a package added there lands in a shard automatically.
function packages(): string[] {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const names = [
    ...(pkg.scripts[SCRIPT] ?? "").matchAll(/--filter=(\S+)/g),
  ].map((m) => m[1]);
  if (names.length === 0) throw new Error(`no --filter entries in ${SCRIPT}`);
  return names;
}

// Longest-processing-time first: heaviest suite into the lightest shard. The
// parts of one split suite go to different shards while there are any left.
function split(all: Suite[], total: number) {
  const shards = Array.from({ length: total }, () => ({
    weight: 0,
    suites: [] as Suite[],
  }));
  const ordered = [...all].sort((a, b) => b.weight - a.weight);
  for (const suite of ordered) {
    const free = shards.filter(
      (shard) =>
        suite.part === undefined ||
        !shard.suites.some((other) => other.name === suite.name),
    );
    const target = (free.length === 0 ? shards : free).reduce((a, b) =>
      b.weight < a.weight ? b : a,
    );
    target.suites.push(suite);
    target.weight += suite.weight;
  }
  return shards;
}

const args = process.argv.slice(2);
// `--selectors`: print the shard's pnpm selectors (each package plus its deps) for a filtered install.
const selectorsOnly = args[0] === "--selectors";
if (selectorsOnly) args.shift();
const [first, second] = args;
const total = Number(second);
if (!Number.isInteger(total) || total < 1) {
  console.error(
    "usage: test-shard.ts <shard> <total> | --print <total> | --selectors <shard> <total>",
  );
  process.exit(2);
}

const shards = split(suites(packages()), total);

if (first === "--print") {
  for (const [i, s] of shards.entries()) {
    console.log(
      `shard ${i + 1}/${total}  ~${Math.round(s.weight)}s  ${s.suites.length} suites`,
    );
    for (const suite of s.suites) console.log(`    ${label(suite)}`);
  }
  process.exit(0);
}

const index = Number(first);
if (!Number.isInteger(index) || index < 1 || index > total) {
  console.error(`shard must be between 1 and ${total}`);
  process.exit(2);
}

const mine = shards[index - 1];
if (selectorsOnly) {
  const names = new Set(mine.suites.map((suite) => suite.name));
  console.log([...names].map((n) => `${n}...`).join(" "));
  process.exit(0);
}
console.log(`shard ${index}/${total}: ${mine.suites.map(label).join(" ")}`);

// spawnSync, not execFileSync: a failing suite should surface vitest's own
// output and exit code, not a Node stack trace from this script.
const run = (args: string[]) => {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
    // pnpm is a .cmd shim on Windows, which Node only spawns through a shell.
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
};
const whole = mine.suites.filter((suite) => suite.part === undefined);
const statuses = [
  ...(whole.length === 0
    ? []
    : [
        run([
          ...whole.map((suite) => `--filter=${suite.name}`),
          "--no-bail",
          "run",
          "test",
        ]),
      ]),
  ...mine.suites
    .filter((suite) => suite.part !== undefined)
    .map((suite) =>
      run([
        `--filter=${suite.name}`,
        "run",
        "test",
        `--shard=${suite.part}/${suite.parts}`,
      ]),
    ),
];
process.exit(statuses.find((status) => status !== 0) ?? 0);
