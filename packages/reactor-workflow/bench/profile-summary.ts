// Top self-time functions and packages across .cpuprofile files.
// Usage: node bench/profile-summary.ts <file-or-dir>... [--top 25]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

type CallFrame = {
  functionName: string;
  url: string;
  lineNumber: number;
};
type ProfileNode = { id: number; callFrame: CallFrame; children?: number[] };
type Profile = {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { top: { type: "string", default: "25" } },
});
const TOP = Number(values.top);

function profilesIn(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((name) => name.endsWith(".cpuprofile"))
    .map((name) => join(path, name));
}

// node_modules/<pkg>, a workspace package, node internals, or the bare url.
function packageOf(url: string): string {
  if (!url) return "(native)";
  if (url.startsWith("node:")) return "node:" + url.slice(5).split("/")[0];
  const modules = url.lastIndexOf("node_modules/");
  if (modules >= 0) {
    const rest = url.slice(modules + 13).split("/");
    return rest[0]!.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]!;
  }
  const workspace = url.match(/\/(packages|apps|clis)\/([^/]+)\//);
  if (workspace) return `ws:${workspace[2]}`;
  return url.split("/").slice(-2).join("/");
}

const shortUrl = (url: string) =>
  url.replace(/^.*\/(node_modules|packages)\//, "");

const byFunction = new Map<string, number>();
const byPackage = new Map<string, number>();
let totalUs = 0;
let files = 0;

for (const path of positionals.flatMap(profilesIn)) {
  const profile = JSON.parse(readFileSync(path, "utf8")) as Profile;
  files++;
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, i) => {
    const us = profile.timeDeltas[i] ?? 0;
    const frame = nodes.get(id)!.callFrame;
    totalUs += us;
    if (frame.functionName === "(idle)") return;
    const key = `${frame.functionName || "(anonymous)"}  ${shortUrl(frame.url)}:${frame.lineNumber + 1}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + us);
    const pkg = ["(program)", "(garbage collector)"].includes(
      frame.functionName,
    )
      ? frame.functionName
      : packageOf(frame.url);
    byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + us);
  });
}

const idle = totalUs - [...byPackage.values()].reduce((a, b) => a + b, 0);
const ms = (us: number) => (us / 1000).toFixed(1).padStart(9);
const pct = (us: number) => `${((100 * us) / totalUs).toFixed(1).padStart(5)}%`;

function table(title: string, rows: Map<string, number>) {
  console.log(`\n${title}`);
  for (const [key, us] of [...rows].sort((a, b) => b[1] - a[1]).slice(0, TOP)) {
    console.log(`${ms(us)}ms ${pct(us)}  ${key}`);
  }
}

console.log(
  `${files} profile(s), ${(totalUs / 1000).toFixed(0)}ms sampled, ${pct(idle).trim()} idle`,
);
table("self time by package", byPackage);
table("self time by function", byFunction);
