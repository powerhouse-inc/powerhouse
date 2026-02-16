#!/usr/bin/env tsx
/**
 * Script to extract and analyse Pyroscope profiling data.
 *
 * Usage:
 *   tsx pyroscope-analyse.ts <pyroscope-browser-url>
 *   tsx pyroscope-analyse.ts --query 'process_cpu{service_name="reactor"}' --from 1700000000 --until 1700003600
 *
 * Examples:
 *   tsx pyroscope-analyse.ts 'http://localhost:4040/?query=process_cpu%7Bservice_name%3D%22reactor%22%7D&from=1700000000&until=1700003600'
 *   tsx pyroscope-analyse.ts 'http://localhost:4040/...' --output-json /tmp/profile --output-md report.md
 *   tsx pyroscope-analyse.ts --query 'process_cpu{service_name="reactor"}' --from 1700000000 --until 1700003600 --top 20
 *   tsx pyroscope-analyse.ts 'http://localhost:4040/...' --baseline /tmp/baseline
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

interface PyroscopeResponse {
  flamebearer: {
    names: string[];
    levels: number[][];
    numTicks: number;
  };
  metadata: {
    sampleRate: number;
    units: string;
  };
}

interface FunctionSelfTime {
  name: string;
  selfTicks: number;
  percentage: number;
}

interface ModuleBreakdown {
  module: string;
  selfTicks: number;
  percentage: number;
}

interface ProfileData {
  functions: FunctionSelfTime[];
  modules: ModuleBreakdown[];
  totalTicks: number;
  units: string;
  sampleRate: number;
}

interface Args {
  pyroscopeBase: string;
  query: string;
  from: string;
  until: string;
  outputJson: string | undefined;
  outputMd: string | undefined;
  baseline: string | undefined;
  top: number;
  profiles: string[];
}

// ── Profile type suffixes ──────────────────────────────────────────────────

const PROFILE_SUFFIXES: Record<string, string> = {
  wall: "wall:wall:nanoseconds:wall:nanoseconds",
  samples: "wall:samples:count:wall:nanoseconds",
  cpu: "wall:cpu:nanoseconds:wall:nanoseconds",
};

// ── Module grouping rules ──────────────────────────────────────────────────

// ── CLI argument parsing ───────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Usage: tsx pyroscope-analyse.ts [pyroscope-browser-url] [options]

Extracts profiling data from Pyroscope and generates a markdown analysis report.

Positional argument:
  <url>                         Pyroscope browser URL (query, from, until extracted automatically)

Options:
  --pyroscope <url>             Pyroscope base URL (default: http://localhost:4040)
  --query <query>               Pyroscope query (e.g. process_cpu{service_name="reactor"})
  --from <timestamp>            Start timestamp (epoch seconds)
  --until <timestamp>           End timestamp (epoch seconds)
  --output-json <base-path>     Save raw JSON ({base}-wall.json, {base}-samples.json, etc.)
  --output-md <path>            Save markdown report to file (default: stdout)
  --baseline <base-path>        Compare against previously saved JSON
  --top <n>                     Number of top functions to show (default: 25)
  --profiles <list>             Comma-separated profile types (default: wall,samples,cpu)
  --help, -h                    Show this help message

Examples:
  tsx pyroscope-analyse.ts 'http://localhost:4040/?query=process_cpu%7Bservice_name%3D%22reactor%22%7D&from=1700000000&until=1700003600'
  tsx pyroscope-analyse.ts --query 'process_cpu{service_name="reactor"}' --from 1700000000 --until 1700003600
  tsx pyroscope-analyse.ts 'http://localhost:4040/...' --output-json /tmp/profile --output-md report.md
  tsx pyroscope-analyse.ts 'http://localhost:4040/...' --baseline /tmp/baseline
`);
}

function parseArgs(argv: string[]): Args {
  let pyroscopeBase = "http://localhost:4040";
  let query = "";
  let from = "";
  let until = "";
  let outputJson: string | undefined;
  let outputMd: string | undefined;
  let baseline: string | undefined;
  let top = 25;
  let profiles = ["wall", "samples", "cpu"];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--pyroscope" && argv[i + 1]) {
      pyroscopeBase = argv[++i];
    } else if (arg === "--query" && argv[i + 1]) {
      query = argv[++i];
    } else if (arg === "--from" && argv[i + 1]) {
      from = argv[++i];
    } else if (arg === "--until" && argv[i + 1]) {
      until = argv[++i];
    } else if (arg === "--output-json" && argv[i + 1]) {
      outputJson = argv[++i];
    } else if (arg === "--output-md" && argv[i + 1]) {
      outputMd = argv[++i];
    } else if (arg === "--baseline" && argv[i + 1]) {
      baseline = argv[++i];
    } else if (arg === "--top" && argv[i + 1]) {
      top = Number(argv[++i]);
    } else if (arg === "--profiles" && argv[i + 1]) {
      profiles = argv[++i].split(",").map((s) => s.trim());
    } else if (!arg.startsWith("-") && !query) {
      // Positional: Pyroscope browser URL
      try {
        const url = new URL(arg);
        pyroscopeBase = `${url.protocol}//${url.host}`;
        const params = url.searchParams;
        if (params.has("query")) query = params.get("query")!;
        if (params.has("from")) from = params.get("from")!;
        if (params.has("until")) until = params.get("until")!;
      } catch {
        console.error(`Error: Invalid URL: ${arg}`);
        process.exit(1);
      }
    } else {
      console.error(`Error: Unrecognized argument: ${arg}`);
      console.error("Use --help for usage information.");
      process.exit(1);
    }
  }

  if (!query) {
    console.error(
      "Error: No query specified. Provide a Pyroscope URL or use --query.",
    );
    console.error("Use --help for usage information.");
    process.exit(1);
  }
  if (!from || !until) {
    console.error(
      "Error: --from and --until are required (or provide a URL containing them).",
    );
    process.exit(1);
  }

  if (isNaN(top) || top < 1) {
    console.error("Error: --top must be a positive integer.");
    process.exit(1);
  }

  for (const p of profiles) {
    if (!PROFILE_SUFFIXES[p]) {
      console.error(
        `Error: Unknown profile type "${p}". Valid types: ${Object.keys(PROFILE_SUFFIXES).join(", ")}`,
      );
      process.exit(1);
    }
  }

  return {
    pyroscopeBase,
    query,
    from,
    until,
    outputJson,
    outputMd,
    baseline,
    top,
    profiles,
  };
}

// ── Profile fetching ───────────────────────────────────────────────────────

function extractFilter(query: string): string {
  // e.g. process_cpu{service_name="reactor"} -> {service_name="reactor"}
  const braceIdx = query.indexOf("{");
  if (braceIdx === -1) return "";
  return query.slice(braceIdx);
}

function buildApiUrl(
  base: string,
  profileType: string,
  filter: string,
  from: string,
  until: string,
): string {
  const suffix = PROFILE_SUFFIXES[profileType];
  const fullQuery = `${suffix}${filter}`;
  const params = new URLSearchParams({
    query: fullQuery,
    from,
    until,
    format: "json",
  });
  return `${base}/pyroscope/render?${params.toString()}`;
}

async function fetchProfile(
  url: string,
  profileType: string,
): Promise<PyroscopeResponse> {
  process.stdout.write(`  Fetching ${profileType} profile... `);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to fetch ${profileType} profile (${res.status}): ${body}`,
      );
    }
    const data = validatePyroscopeResponse(await res.json());
    const tickCount = data.flamebearer.numTicks ?? 0;
    process.stdout.write(`${tickCount.toLocaleString()} ticks\n`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function validatePyroscopeResponse(data: unknown): PyroscopeResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid Pyroscope response: expected an object");
  }
  const obj = data as Record<string, unknown>;
  const fb = obj.flamebearer as Record<string, unknown> | undefined;
  if (!fb || !Array.isArray(fb.names) || !Array.isArray(fb.levels)) {
    throw new Error("Invalid Pyroscope response: missing flamebearer data");
  }
  return data as PyroscopeResponse;
}

// ── Flamegraph parser ──────────────────────────────────────────────────────

function parseFlamegraph(response: PyroscopeResponse): ProfileData {
  const { names, levels, numTicks } = response.flamebearer;
  const { units, sampleRate } = response.metadata;

  const selfMap = new Map<string, number>();

  for (const level of levels) {
    // Each node is 4 values: [offset, total, self, nameIndex]
    for (let i = 0; i < level.length; i += 4) {
      const selfTicks = level[i + 2];
      const nameIndex = level[i + 3];
      if (selfTicks > 0) {
        const name = names[nameIndex];
        selfMap.set(name, (selfMap.get(name) ?? 0) + selfTicks);
      }
    }
  }

  // Sort by self ticks descending
  const functions: FunctionSelfTime[] = [...selfMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, selfTicks]) => ({
      name,
      selfTicks,
      percentage: numTicks > 0 ? (selfTicks / numTicks) * 100 : 0,
    }));

  // Module grouping
  const moduleMap = new Map<string, number>();
  for (const [name, ticks] of selfMap) {
    const mod = classifyModule(name);
    moduleMap.set(mod, (moduleMap.get(mod) ?? 0) + ticks);
  }

  const modules: ModuleBreakdown[] = [...moduleMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([module, selfTicks]) => ({
      module,
      selfTicks,
      percentage: numTicks > 0 ? (selfTicks / numTicks) * 100 : 0,
    }));

  return { functions, modules, totalTicks: numTicks, units, sampleRate };
}

// ── Module classification ──────────────────────────────────────────────────

function classifyModule(name: string): string {
  // node_modules/.pnpm/pkg@version/node_modules/pkg/... -> pkg
  const pnpmMatch = name.match(
    /node_modules\/\.pnpm\/[^/]+\/node_modules\/([^/]+)/,
  );
  if (pnpmMatch) return pnpmMatch[1];

  // node_modules/pkg/... -> pkg
  const nmMatch = name.match(/node_modules\/([^/.][^/]*)/);
  if (nmMatch) return nmMatch[1];

  // ./packages/name/... -> packages/name
  const pkgMatch = name.match(/\.\/packages\/([^/]+)/);
  if (pkgMatch) return `packages/${pkgMatch[1]}`;

  // node:module:fn:line -> node:module
  const nodeMatch = name.match(/^(node:[^:]+)/);
  if (nodeMatch) return nodeMatch[1];

  // :builtinName:line -> the builtin (GC, writev, etc.)
  const builtinMatch = name.match(/^:([^:]+):/);
  if (builtinMatch) return builtinMatch[1];

  return "other";
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatTicks(ticks: number, units: string, sampleRate: number): string {
  if (units === "nanoseconds") {
    const ms = ticks / 1_000_000;
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(1)}ms`;
  }
  // samples
  if (sampleRate > 0) {
    const seconds = ticks / sampleRate;
    if (seconds >= 1) return `${seconds.toFixed(2)}s`;
    return `${(seconds * 1000).toFixed(1)}ms`;
  }
  return `${ticks.toLocaleString()} samples`;
}

// ── Markdown generation ────────────────────────────────────────────────────

function generateMarkdown(
  profileData: Map<string, ProfileData>,
  args: Args,
  baselineData: Map<string, ProfileData> | null,
): string {
  const lines: string[] = [];
  const wall = profileData.get("wall");
  const cpu = profileData.get("cpu");

  // ── Summary ──
  lines.push("## Profiling Summary\n");
  lines.push(`- **Query:** \`${args.query}\``);
  lines.push(`- **Time range:** ${args.from} → ${args.until}`);

  if (wall) {
    lines.push(
      `- **Total wall time:** ${formatTicks(wall.totalTicks, wall.units, wall.sampleRate)}`,
    );
  }
  if (cpu) {
    lines.push(
      `- **Total CPU time:** ${formatTicks(cpu.totalTicks, cpu.units, cpu.sampleRate)}`,
    );
  }
  if (wall && cpu && wall.totalTicks > 0 && cpu.totalTicks > 0) {
    // Both in nanoseconds
    const ratio = wall.totalTicks / cpu.totalTicks;
    lines.push(`- **Wall:CPU ratio:** ${ratio.toFixed(2)}x`);
  }
  if (wall) {
    lines.push(`- **Unique functions:** ${wall.functions.length}`);
    if (wall.modules.length > 0) {
      lines.push(
        `- **Top module:** ${wall.modules[0].module} (${wall.modules[0].percentage.toFixed(1)}%)`,
      );
    }
  }
  lines.push("");

  // ── Top Functions ──
  if (wall) {
    lines.push(`## Top ${args.top} Functions by Self Time (wall)\n`);
    lines.push("| Rank | Self Time | % of Total | Function |");
    lines.push("|-----:|----------:|-----------:|----------|");

    const topFns = wall.functions.slice(0, args.top);
    for (let i = 0; i < topFns.length; i++) {
      const fn = topFns[i];
      const time = formatTicks(fn.selfTicks, wall.units, wall.sampleRate);
      lines.push(
        `| ${i + 1} | ${time} | ${fn.percentage.toFixed(1)}% | \`${fn.name}\` |`,
      );
    }
    lines.push("");
  }

  // ── Module Breakdown ──
  if (wall) {
    lines.push("## Module Breakdown (wall)\n");
    lines.push("| Module | Self Time | % of Total |");
    lines.push("|--------|----------:|-----------:|");

    for (const mod of wall.modules) {
      const time = formatTicks(mod.selfTicks, wall.units, wall.sampleRate);
      lines.push(`| ${mod.module} | ${time} | ${mod.percentage.toFixed(1)}% |`);
    }
    lines.push("");
  }

  // ── Wall vs CPU Comparison ──
  if (wall && cpu) {
    lines.push(`## Wall vs CPU Comparison (top ${args.top} functions)\n`);
    lines.push(
      "| Rank | Wall Time | Wall % | CPU Time | CPU % | Wall:CPU Ratio | Function |",
    );
    lines.push(
      "|-----:|----------:|-------:|---------:|------:|---------------:|----------|",
    );

    const wallFnMap = new Map(wall.functions.map((f) => [f.name, f]));
    const cpuFnMap = new Map(cpu.functions.map((f) => [f.name, f]));

    // Use wall top N, sorted by wall self time
    const topFns = wall.functions.slice(0, args.top);
    for (let i = 0; i < topFns.length; i++) {
      const w = topFns[i];
      const c = cpuFnMap.get(w.name);
      const wallTime = formatTicks(w.selfTicks, wall.units, wall.sampleRate);
      const wallPct = `${w.percentage.toFixed(1)}%`;
      const cpuTime = c
        ? formatTicks(c.selfTicks, cpu.units, cpu.sampleRate)
        : "-";
      const cpuPct = c ? `${c.percentage.toFixed(1)}%` : "-";
      const ratio =
        c && c.selfTicks > 0
          ? `${(w.selfTicks / c.selfTicks).toFixed(2)}x`
          : "-";
      lines.push(
        `| ${i + 1} | ${wallTime} | ${wallPct} | ${cpuTime} | ${cpuPct} | ${ratio} | \`${w.name}\` |`,
      );
    }
    lines.push("");
  }

  // ── Baseline Comparison ──
  if (baselineData) {
    lines.push("## Baseline Comparison (by module)\n");

    for (const profileType of args.profiles) {
      const current = profileData.get(profileType);
      const base = baselineData.get(profileType);
      if (!current || !base) continue;

      lines.push(`### ${profileType}\n`);
      lines.push("| Module | Baseline | Current | Delta | Change % |");
      lines.push("|--------|--------:|---------:|------:|---------:|");

      const allModules = new Set([
        ...current.modules.map((m) => m.module),
        ...base.modules.map((m) => m.module),
      ]);

      const curMap = new Map(current.modules.map((m) => [m.module, m]));
      const baseMap = new Map(base.modules.map((m) => [m.module, m]));

      const sorted = [...allModules].sort((a, b) => {
        return (
          (curMap.get(b)?.selfTicks ?? 0) - (curMap.get(a)?.selfTicks ?? 0)
        );
      });

      for (const mod of sorted) {
        const cur = curMap.get(mod);
        const bas = baseMap.get(mod);
        const curTicks = cur?.selfTicks ?? 0;
        const basTicks = bas?.selfTicks ?? 0;
        const delta = curTicks - basTicks;
        const changePct =
          basTicks > 0 ? ((delta / basTicks) * 100).toFixed(1) : "new";

        const curTime = cur
          ? formatTicks(curTicks, current.units, current.sampleRate)
          : "-";
        const basTime = bas
          ? formatTicks(basTicks, base.units, base.sampleRate)
          : "-";
        const deltaStr =
          delta === 0
            ? "0"
            : delta > 0
              ? `+${formatTicks(delta, current.units, current.sampleRate)}`
              : `-${formatTicks(Math.abs(delta), current.units, current.sampleRate)}`;
        const changeStr =
          changePct === "new"
            ? "new"
            : `${Number(changePct) >= 0 ? "+" : ""}${changePct}%`;

        lines.push(
          `| ${mod} | ${basTime} | ${curTime} | ${deltaStr} | ${changeStr} |`,
        );
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ── JSON file I/O ──────────────────────────────────────────────────────────

async function saveJson(
  basePath: string,
  profileType: string,
  data: PyroscopeResponse,
): Promise<void> {
  const filePath = `${basePath}-${profileType}.json`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2));
  process.stdout.write(`  Saved ${filePath}\n`);
}

async function loadJson(
  basePath: string,
  profileType: string,
): Promise<PyroscopeResponse> {
  const filePath = `${basePath}-${profileType}.json`;
  const content = await readFile(filePath, "utf-8");
  return validatePyroscopeResponse(JSON.parse(content));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filter = extractFilter(args.query);

  console.log("Pyroscope Profile Analyser");
  console.log(`  Base URL: ${args.pyroscopeBase}`);
  console.log(`  Query: ${args.query}`);
  console.log(`  Filter: ${filter || "(none)"}`);
  console.log(`  Range: ${args.from} → ${args.until}`);
  console.log(`  Profiles: ${args.profiles.join(", ")}`);
  console.log("");

  // Fetch profiles
  const rawProfiles = new Map<string, PyroscopeResponse>();
  console.log("Fetching profiles...");

  for (const profileType of args.profiles) {
    const url = buildApiUrl(
      args.pyroscopeBase,
      profileType,
      filter,
      args.from,
      args.until,
    );
    try {
      const data = await fetchProfile(url, profileType);
      rawProfiles.set(profileType, data);

      if (args.outputJson) {
        await saveJson(args.outputJson, profileType, data);
      }
    } catch (err) {
      console.error(
        `  Warning: Failed to fetch ${profileType}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Parse flamegraphs
  console.log("\nParsing flamegraphs...");
  const profileData = new Map<string, ProfileData>();
  for (const [type, raw] of rawProfiles) {
    const parsed = parseFlamegraph(raw);
    profileData.set(type, parsed);
    process.stdout.write(
      `  ${type}: ${parsed.functions.length} functions, ${parsed.modules.length} modules\n`,
    );
  }

  // Load baseline if provided
  let baselineData: Map<string, ProfileData> | null = null;
  if (args.baseline) {
    console.log(`\nLoading baseline from ${args.baseline}...`);
    baselineData = new Map();
    for (const profileType of args.profiles) {
      try {
        const raw = await loadJson(args.baseline, profileType);
        const parsed = parseFlamegraph(raw);
        baselineData.set(profileType, parsed);
        process.stdout.write(
          `  ${profileType}: ${parsed.functions.length} functions\n`,
        );
      } catch (err) {
        console.error(
          `  Warning: Could not load baseline for ${profileType}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // Generate markdown
  console.log("\nGenerating report...\n");
  const markdown = generateMarkdown(profileData, args, baselineData);

  if (args.outputMd) {
    await mkdir(dirname(args.outputMd), { recursive: true });
    await writeFile(args.outputMd, markdown);
    console.log(`Report saved to ${args.outputMd}`);
  } else {
    console.log(markdown);
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
