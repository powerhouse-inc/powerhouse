// Benchmarks registry refs on the same Docker stack: publish storm to
// visibility, read load per endpoint, and a full rollout. Args: A=<ref> B=<ref>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasRenownLogin, renownToken, verdaccioToken } from "./lib/auth.js";
import { StatsSampler, type ContainerUsage } from "./lib/docker-stats.js";
import { load, type LoadResult } from "./lib/load.js";
import {
  bundleFile,
  probePackage,
  publishProbe,
  type ProbePackage,
} from "./lib/publisher.js";
import { registryImage } from "./lib/refs.js";
import { RESULTS_DIR } from "./lib/results.js";
import { log, sleep } from "./lib/sh.js";
import { REPLICA_URL, REPLICAS, Stack, waitReady } from "./lib/stack.js";

const AUDIENCE = "https://registry.dev.vetra.io";
const PACKAGES = Number(process.env.BENCH_PACKAGES ?? 30);
const PUBLISH_CONCURRENCY = Number(process.env.BENCH_PUBLISH_CONCURRENCY ?? 6);
const LOAD_CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 16);
const LOAD_MS = Number(process.env.BENCH_LOAD_SECONDS ?? 15) * 1000;
const VISIBLE_TIMEOUT_MS = 120_000;
const ROLLOUT_WINDOW_MS = 90_000;

interface RefBench {
  label: string;
  ref: string;
  sha: string;
  publish: {
    ok: number;
    visible: number;
    p50VisibleMs: number | null;
    p95VisibleMs: number | null;
    maxVisibleMs: number | null;
    usage: Record<string, ContainerUsage>;
  };
  reads: Record<string, LoadResult & { usage: Record<string, ContainerUsage> }>;
  rollout: {
    readyMs: number[];
    /** Until every replica lists every piece; null if not within the window */
    allPiecesMs: (number | null)[];
    usage: Record<string, ContainerUsage>;
  };
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

const replicaUrls = REPLICAS.map((r) => REPLICA_URL[r]);
let turn = 0;
const nextReplica = () => replicaUrls[turn++ % replicaUrls.length];
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

async function answers(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    await res.arrayBuffer();
    return res.ok;
  } catch {
    return false;
  }
}

// From publish done until the piece version answers on every replica
async function visibleEverywhere(
  pkg: ProbePackage,
  since: number,
): Promise<number | null> {
  const route = `/pieces/${pkg.piece}?version=${pkg.version}`;
  const pending = new Set(replicaUrls);
  while (pending.size > 0 && Date.now() - since < VISIBLE_TIMEOUT_MS) {
    for (const base of [...pending]) {
      if (await answers(`${base}${route}`)) pending.delete(base);
    }
    if (pending.size > 0) await sleep(250);
  }
  return pending.size === 0 ? Date.now() - since : null;
}

async function pieceCount(base: string): Promise<number> {
  try {
    const res = await fetch(`${base}/pieces`, {
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as { total: number }).total : -1;
  } catch {
    return -1;
  }
}

async function benchRef(label: string, ref: string): Promise<RefBench> {
  const built = await registryImage(ref);
  const renown = hasRenownLogin();
  const stack = new Stack({ image: built.image, authRenown: renown });
  const stats = new StatsSampler();
  await stack.down();
  await stack.up();
  stats.start();
  try {
    const runId = `${Date.now()}`;
    const token = renown
      ? (await renownToken(AUDIENCE)).token
      : await verdaccioToken(nextReplica(), `bench-${runId}`, "pw");
    const pkgs = Array.from({ length: PACKAGES }, (_, i) =>
      probePackage(`registry-bench-${runId}-${i}`, "1.0.0"),
    );

    log(`[${label}] publishing ${PACKAGES} packages`);
    const publishStart = Date.now();
    const visibleTimes: number[] = [];
    let ok = 0;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: PUBLISH_CONCURRENCY }, async () => {
        while (cursor < pkgs.length) {
          const pkg = pkgs[cursor++];
          const record = await publishProbe(pkg, nextReplica(), token);
          if (!record.ok) continue;
          ok++;
          const visible = await visibleEverywhere(pkg, record.finishedAt);
          if (visible !== null) visibleTimes.push(visible);
        }
      }),
    );
    const publishEnd = Date.now();

    const cdnFile = "dist/powerhouse.manifest.json";
    const endpoints: Record<string, () => string> = {
      packages: () => `${nextReplica()}/packages`,
      "packages-search": () =>
        `${nextReplica()}/packages?search=${encodeURIComponent(pick(pkgs).name)}`,
      pieces: () => `${nextReplica()}/pieces`,
      "piece-version": () => {
        const pkg = pick(pkgs);
        return `${nextReplica()}/pieces/${pkg.piece}?version=${pkg.version}`;
      },
      "piece-bundle": () => {
        const pkg = pick(pkgs);
        return `${nextReplica()}/-/pieces/bundled/${bundleFile(pkg.piece, pkg.version)}`;
      },
      "cdn-file": () => {
        const pkg = pick(pkgs);
        return `${nextReplica()}/-/cdn/${pkg.name}@${pkg.version}/${cdnFile}`;
      },
      "npm-metadata": () => `${nextReplica()}/${pick(pkgs).name}`,
    };
    const reads: RefBench["reads"] = {};
    for (const [name, url] of Object.entries(endpoints)) {
      log(`[${label}] load ${name}`);
      const from = Date.now();
      const result = await load({
        url,
        concurrency: LOAD_CONCURRENCY,
        durationMs: LOAD_MS,
      });
      reads[name] = { ...result, usage: stats.usage(from, Date.now()) };
    }

    log(`[${label}] rollout: replacing every replica`);
    const rolloutStart = Date.now();
    await stack.compose(["rm", "-sf", ...REPLICAS]);
    await stack.compose(["up", "-d", "--no-deps", ...REPLICAS]);
    const readyMs = await Promise.all(
      replicaUrls.map(async (base) => (await waitReady(base)) - rolloutStart),
    );
    const allPiecesMs = await Promise.all(
      replicaUrls.map(async (base) => {
        while (Date.now() - rolloutStart < ROLLOUT_WINDOW_MS) {
          if ((await pieceCount(base)) >= PACKAGES) {
            return Date.now() - rolloutStart;
          }
          await sleep(500);
        }
        return null;
      }),
    );
    // The whole window, so warm-up work after the pods answer counts too
    await sleep(Math.max(0, rolloutStart + ROLLOUT_WINDOW_MS - Date.now()));

    return {
      label,
      ref,
      sha: built.sha,
      publish: {
        ok,
        visible: visibleTimes.length,
        p50VisibleMs: quantile(visibleTimes, 0.5),
        p95VisibleMs: quantile(visibleTimes, 0.95),
        maxVisibleMs: quantile(visibleTimes, 1),
        usage: stats.usage(publishStart, publishEnd),
      },
      reads,
      rollout: {
        readyMs,
        allPiecesMs,
        usage: stats.usage(rolloutStart, Date.now()),
      },
    };
  } finally {
    await stats.stop();
    await stack.down();
  }
}

// Replica containers only: registry-e2e-registry-<n>-1
function registryCpuSeconds(usage: Record<string, ContainerUsage>): number {
  const total = Object.entries(usage)
    .filter(([name]) => /-registry-\d/.test(name))
    .reduce((sum, [, u]) => sum + u.cpuSeconds, 0);
  return Math.round(total * 10) / 10;
}

function markdown(runs: RefBench[]): string {
  const rows: string[] = [];
  const header = `| | ${runs.map((r) => `${r.label} (${r.sha})`).join(" | ")} |`;
  const rule = `|---|${runs.map(() => "---").join("|")}|`;
  const row = (name: string, cell: (r: RefBench) => string) =>
    rows.push(`| ${name} | ${runs.map(cell).join(" | ")} |`);
  const ms = (v: number | null) => (v === null ? "never" : `${v} ms`);

  rows.push(
    `### Publish storm (${PACKAGES} packages, ${PUBLISH_CONCURRENCY} at a time)`,
    "",
    header,
    rule,
  );
  row("Published", (r) => `${r.publish.ok}/${PACKAGES}`);
  row("Visible on every replica", (r) => `${r.publish.visible}/${PACKAGES}`);
  row("Time to visible, p50", (r) => ms(r.publish.p50VisibleMs));
  row("Time to visible, p95", (r) => ms(r.publish.p95VisibleMs));
  row("Time to visible, max", (r) => ms(r.publish.maxVisibleMs));
  row("Replica CPU-seconds", (r) => `${registryCpuSeconds(r.publish.usage)}`);
  rows.push(
    "",
    `### Reads (${LOAD_CONCURRENCY} concurrent, ${LOAD_MS / 1000} s each, straight to the replicas)`,
    "",
  );
  for (const name of Object.keys(runs[0].reads)) {
    rows.push(`#### ${name}`, "", header, rule);
    row("Requests/s", (r) => `${r.reads[name].rps}`);
    row(
      "p50 / p95 / p99",
      (r) =>
        `${r.reads[name].p50} / ${r.reads[name].p95} / ${r.reads[name].p99} ms`,
    );
    row(
      "Failed responses",
      (r) =>
        `${r.reads[name].failures + r.reads[name].errors} of ${r.reads[name].requests}`,
    );
    row("Statuses", (r) => JSON.stringify(r.reads[name].statuses));
    row(
      "Replica CPU-seconds",
      (r) => `${registryCpuSeconds(r.reads[name].usage)}`,
    );
    rows.push("");
  }
  rows.push(
    `### Rollout (every replica replaced, ${ROLLOUT_WINDOW_MS / 1000} s window)`,
    "",
    header,
    rule,
  );
  row("Ready (/-/ping)", (r) =>
    r.rollout.readyMs.map((v) => `${v} ms`).join(", "),
  );
  row("Every piece listed", (r) => r.rollout.allPiecesMs.map(ms).join(", "));
  row("Replica CPU-seconds", (r) => `${registryCpuSeconds(r.rollout.usage)}`);
  return rows.join("\n");
}

const refs = process.argv
  .slice(2)
  .filter((a) => a.includes("="))
  .map((a) => a.split("=", 2) as [string, string]);
const targets: [string, string][] =
  refs.length > 0
    ? refs
    : [
        ["A", "origin/main"],
        ["B", "HEAD"],
      ];

const runs: RefBench[] = [];
for (const [label, ref] of targets) runs.push(await benchRef(label, ref));

mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const json = path.join(RESULTS_DIR, `bench-${stamp}.json`);
const md = path.join(RESULTS_DIR, `bench-${stamp}.md`);
writeFileSync(json, `${JSON.stringify(runs, null, 2)}\n`);
writeFileSync(md, `${markdown(runs)}\n`);
log(`wrote ${json}`);
log(`wrote ${md}`);
