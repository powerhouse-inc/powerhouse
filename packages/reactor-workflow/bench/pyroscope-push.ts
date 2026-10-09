// Merges .cpuprofile files into folded stacks and pushes them to Pyroscope.
// Usage: node bench/pyroscope-push.ts <file-or-dir>... --labels process=worker
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

type CallFrame = { functionName: string; url: string; lineNumber: number };
type ProfileNode = { id: number; callFrame: CallFrame; children?: number[] };
type Profile = {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
};

export function profilesIn(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((name) => name.endsWith(".cpuprofile"))
    .map((name) => join(path, name));
}

const frameName = ({ functionName, url, lineNumber }: CallFrame) => {
  const file = url.replace(/^.*\/(node_modules|packages)\//, "");
  const name = `${functionName || "(anonymous)"}${file ? ` ${file}:${lineNumber + 1}` : ""}`;
  // ";" separates frames in the folded format.
  return name.replaceAll(";", ",");
};

// Folded stacks in microseconds, root first, across every file.
function fold(paths: string[]) {
  const stacks = new Map<string, number>();
  let from = Infinity;
  let until = 0;
  for (const path of paths) {
    const profile = JSON.parse(readFileSync(path, "utf8")) as Profile;
    from = Math.min(from, profile.startTime);
    until = Math.max(until, profile.endTime);
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    const parents = new Map<number, number>();
    for (const node of profile.nodes) {
      for (const child of node.children ?? []) parents.set(child, node.id);
    }
    const folded = new Map<number, string>();
    const stackOf = (id: number): string => {
      const cached = folded.get(id);
      if (cached !== undefined) return cached;
      const parent = parents.get(id);
      const name = frameName(nodes.get(id)!.callFrame);
      const stack =
        parent === undefined || name === "(root)"
          ? name
          : `${stackOf(parent)};${name}`;
      folded.set(id, stack);
      return stack;
    };
    profile.samples.forEach((id, i) => {
      if (nodes.get(id)!.callFrame.functionName === "(idle)") return;
      const stack = stackOf(id);
      stacks.set(
        stack,
        (stacks.get(stack) ?? 0) + (profile.timeDeltas[i] ?? 0),
      );
    });
  }
  return { stacks, from: from / 1e6, until: until / 1e6 };
}

export async function pushProfiles(
  paths: string[],
  url: string,
  app: string,
  labels: Record<string, string>,
  // Wall-clock seconds; profile timestamps are monotonic, not epoch.
  window?: { from: number; until: number },
): Promise<void> {
  if (paths.length === 0) return;
  const folded = fold(paths);
  const { stacks } = folded;
  const until = window?.until ?? Date.now() / 1000;
  const from = window?.from ?? until - (folded.until - folded.from);
  const body = [...stacks]
    .map(([stack, us]) => `${stack} ${Math.round(us)}`)
    .join("\n");
  const tags = Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  const query = new URLSearchParams({
    name: `${app}.cpu{${tags}}`,
    from: String(Math.floor(from)),
    until: String(Math.ceil(until)),
    format: "folded",
    // One sample per microsecond, so values read as CPU time.
    sampleRate: "1000000",
    spyName: "nodespy",
    units: "samples",
  });
  const response = await fetch(`${url}/ingest?${query}`, {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(
      `Pyroscope ingest ${response.status}: ${await response.text()}`,
    );
  }
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string", default: "http://localhost:4040" },
      app: { type: "string", default: "reactor-workflow-bench" },
      labels: { type: "string", default: "" },
    },
  });
  const labels = Object.fromEntries(
    values.labels
      .split(",")
      .filter(Boolean)
      .map((pair) => pair.split("=") as [string, string]),
  );
  const paths = positionals.flatMap(profilesIn);
  await pushProfiles(paths, values.url, values.app, labels);
  console.log(`pushed ${paths.length} profile(s) to ${values.url}`);
}
