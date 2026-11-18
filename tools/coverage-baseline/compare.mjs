import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readLines, totals, totalsByOwner } from "./lines.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    owner: { type: "string", multiple: true },
    all: { type: "boolean", default: false },
  },
});
if (positionals.length < 1 || positionals.length > 2)
  throw new Error(
    "Usage: pnpm test:coverage:compare <run> [<baseline-run>] [--owner packages/x] [--all]",
  );
const [current, baseline] = positionals.map((path) => resolve(path));

function load(run) {
  const result = {};
  for (const level of ["unit", "integration", "e2e", "combined"]) {
    const file = join(run, "lcov", `${level}.info`);
    if (!existsSync(file)) continue;
    const lines = readLines(file);
    result[level] = { total: totals(lines), owners: totalsByOwner(lines) };
  }
  if (!Object.keys(result).length)
    throw new Error(`No lcov/<level>.info files in ${run}`);
  return result;
}

const now = load(current);
const before = baseline ? load(baseline) : undefined;
const percent = (value) => (value ? `${value.percent.toFixed(1)}%` : "-");
const delta = (a, b) => {
  if (!a || !b) return "";
  const points = a.percent - b.percent;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)}`;
};
const row = (name, a, b) =>
  [
    name.padEnd(48),
    percent(a).padStart(7),
    ...(before ? [percent(b).padStart(9), delta(a, b).padStart(7)] : []),
    `${a?.hit ?? 0}/${a?.found ?? 0}`.padStart(15),
  ].join(" ");
const header = (title) =>
  [
    title.padEnd(48),
    "lines".padStart(7),
    ...(before ? ["baseline".padStart(9), "change".padStart(7)] : []),
    "hit/found".padStart(15),
  ].join(" ");

for (const level of Object.keys(now)) {
  console.log(`\n${header(level)}`);
  console.log(row("repository", now[level].total, before?.[level]?.total));
  for (const owner of Object.keys(now[level].owners)) {
    if (values.owner?.length && !values.owner.includes(owner)) continue;
    const a = now[level].owners[owner],
      b = before?.[level]?.owners[owner];
    // Without --all, a comparison lists only owners whose hits changed.
    if (before && !values.all && !values.owner && a.hit === b?.hit) continue;
    console.log(row(`  ${owner}`, a, b));
  }
}
