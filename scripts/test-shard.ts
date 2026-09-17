// Split the `test:ci` package list into balanced shards and run one.
// Usage: tsx scripts/test-shard.ts <shard> <total> | --print <total>

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Balance hints only: a stale or missing entry costs balance, never coverage.
const WEIGHTS = JSON.parse(
  readFileSync(join(root, "scripts/test-weights.json"), "utf8"),
) as Record<string, number>;
const DEFAULT_WEIGHT = 5;

// Read from test:ci so a package added there lands in a shard automatically.
function packages(): string[] {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const names = [...pkg.scripts["test:ci"].matchAll(/--filter=(\S+)/g)].map(
    (m) => m[1],
  );
  if (names.length === 0) throw new Error("no --filter entries in test:ci");
  const scope = process.env.TEST_SCOPE_FILTERS ?? "";
  if (scope.trim() === "") return names;
  // Narrowed to the packages .github/actions/test-scope selected for the diff.
  const selected = new Set(
    [...scope.matchAll(/--filter=(\S+)/g)].map((m) => m[1]),
  );
  return names.filter((n) => selected.has(n));
}

// Longest-processing-time first: heaviest suite into the lightest shard.
function split(names: string[], total: number) {
  const shards = Array.from({ length: total }, () => ({
    weight: 0,
    names: [] as string[],
  }));
  const ordered = [...names].sort(
    (a, b) => (WEIGHTS[b] ?? DEFAULT_WEIGHT) - (WEIGHTS[a] ?? DEFAULT_WEIGHT),
  );
  for (const name of ordered) {
    const target = shards.reduce((a, b) => (b.weight < a.weight ? b : a));
    target.names.push(name);
    target.weight += WEIGHTS[name] ?? DEFAULT_WEIGHT;
  }
  return shards;
}

const [first, second] = process.argv.slice(2);
const total = Number(second);
if (!Number.isInteger(total) || total < 1) {
  console.error("usage: test-shard.ts <shard> <total> | --print <total>");
  process.exit(2);
}

const shards = split(packages(), total);

if (first === "--print") {
  for (const [i, s] of shards.entries()) {
    console.log(
      `shard ${i + 1}/${total}  ~${s.weight}s  ${s.names.length} pkgs`,
    );
    for (const n of s.names) console.log(`    ${n}`);
  }
  process.exit(0);
}

const index = Number(first);
if (!Number.isInteger(index) || index < 1 || index > total) {
  console.error(`shard must be between 1 and ${total}`);
  process.exit(2);
}

const mine = shards[index - 1];
if (mine.names.length === 0) {
  console.log(`shard ${index}/${total}: no packages selected`);
  process.exit(0);
}
console.log(`shard ${index}/${total}: ${mine.names.join(" ")}`);

// spawnSync, not execFileSync: a failing suite should surface vitest's own
// output and exit code, not a Node stack trace from this script.
const result = spawnSync(
  "pnpm",
  [...mine.names.map((n) => `--filter=${n}`), "--no-bail", "run", "test"],
  { cwd: root, stdio: "inherit", env: { ...process.env, CI: "true" } },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
