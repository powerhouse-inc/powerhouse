// Ramps load on the alpha-shaped stack until something breaks, and reports
// per-component CPU and memory at every step. Usage: stress.ts [REF=HEAD]
// STRESS_ARCH=legacy runs the verdaccio registry as dev deploys it.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hasRenownLogin, renownToken, verdaccioToken } from "./lib/auth.js";
import {
  publishSeed,
  seedPackage,
  type PublishResult,
} from "./lib/fast-publish.js";
import type { LoadJob, LoadOutput } from "./lib/load-proc.js";
import { READ_MIX, type SeedPackage } from "./lib/mix.js";
import { registryImage } from "./lib/refs.js";
import { VisibilityTracker } from "./lib/replica-visibility.js";
import { RESULTS_DIR } from "./lib/results.js";
import { log, sleep } from "./lib/sh.js";
import {
  STRESS_NGINX,
  STRESS_REPLICAS,
  StressSampler,
  StressStack,
  type ContainerState,
  type StressArch,
} from "./lib/stress-stack.js";

const AUDIENCE = "https://registry.dev.vetra.io";
const env = (name: string, fallback: string) => process.env[name] ?? fallback;
const levels = (name: string, fallback: string) =>
  env(name, fallback).split(",").map(Number);

const SEEDS = Number(env("STRESS_SEEDS", "60"));
const STEP_MS = Number(env("STRESS_STEP_SECONDS", "20")) * 1000;
const READ_LEVELS = levels("STRESS_READ_LEVELS", "16,32,64,128,256,512,1024");
// Publishes per second, issued on a schedule whatever the replies take
const PUBLISH_LEVELS = levels("STRESS_PUBLISH_LEVELS", "1,2,4,8,16,32,64");
const MIXED_PUBLISH_RATE = Number(env("STRESS_MIXED_PUBLISH_RATE", "4"));
const SCENARIOS = env(
  "STRESS_SCENARIOS",
  "reads-cached,reads-uncached,publish,mixed",
).split(",");
const MAX_ERROR_RATE = 0.01;
const MAX_P99_MS = 2000;
const MAX_LAG_MS = 30_000;
const SATURATED_CPU = 85;
const SATURATED_MEM = 90;
const GENERATOR_CPU = 90;
const MAX_GENERATORS = 8;
const ARCH: StressArch =
  env("STRESS_ARCH", "stateless") === "legacy" ? "legacy" : "stateless";
const LEGACY = ARCH === "legacy";

interface Usage {
  /** Cores used on average, and the container's limit */
  cores: number;
  limit: number;
  avgCpu: number;
  maxCpu: number;
  maxMem: number;
  maxMemMb: number;
}

interface Step {
  scenario: string;
  level: number;
  requests: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  statuses: Record<string, number>;
  errors: Record<string, number>;
  failedRoutes: Record<string, number>;
  generatorCpu: number;
  usage: Record<string, Usage>;
  postgres: {
    maxConnections: number;
    maxActive: number;
    maxWaiting: number;
    maxQueuedJobs: number;
  };
  publish?: {
    published: number;
    failed: number;
    readyAfterDrain: number;
    unprocessed: number;
    p95LagMs: number | null;
    drainMs: number | null;
    /** Legacy: lag until every replica served it, and how many never did */
    everyReplicaP95LagMs?: number | null;
    notOnEveryReplica?: number;
  };
  /** Legacy: replicas that disagree, which doesn't stop the ramp */
  diverged?: string;
  restarts: string[];
  saturated: string[];
  broke: string[];
}

interface ScenarioResult {
  scenario: string;
  steps: Step[];
  breakingLevel: number | null;
  firstToBreak: string | null;
  /** The first level at which any component saturated, and which */
  firstSaturated: { level: number; services: string[] } | null;
  logs: Record<string, string[]>;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, i)];
}

function runProc(job: LoadJob): Promise<LoadOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(import.meta.dirname, "lib/load-proc.ts")],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`load process exited ${code}`));
        return;
      }
      resolve(JSON.parse(Buffer.concat(chunks).toString()) as LoadOutput);
    });
    child.stdin.end(JSON.stringify(job));
  });
}

async function readLoad(
  seeds: SeedPackage[],
  concurrency: number,
  bustCache: boolean,
) {
  const procs = Math.min(
    MAX_GENERATORS,
    Math.max(1, Math.ceil(concurrency / 8)),
  );
  const outputs = await Promise.all(
    Array.from({ length: procs }, (_, i) =>
      runProc({
        bases: [STRESS_NGINX],
        seeds,
        mix: READ_MIX,
        concurrency:
          Math.floor(concurrency / procs) + (i < concurrency % procs ? 1 : 0),
        durationMs: STEP_MS,
        bustCache,
        timeoutMs: 30_000,
        style: ARCH,
      }),
    ),
  );
  const latencies = outputs.flatMap((o) => o.latencies).sort((a, b) => a - b);
  const statuses: Record<string, number> = {};
  const errors: Record<string, number> = {};
  const failedRoutes: Record<string, number> = {};
  let failed = 0;
  for (const o of outputs) {
    for (const [k, v] of Object.entries(o.statuses)) {
      statuses[k] = (statuses[k] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(o.errors))
      errors[k] = (errors[k] ?? 0) + v;
    for (const [route, t] of Object.entries(o.byRoute)) {
      failed += t.failed;
      if (t.failed > 0)
        failedRoutes[route] = (failedRoutes[route] ?? 0) + t.failed;
    }
  }
  return {
    requests: latencies.length,
    rps: Math.round(latencies.length / (STEP_MS / 1000)),
    p50: pct(latencies, 50),
    p95: pct(latencies, 95),
    p99: pct(latencies, 99),
    errorRate: latencies.length ? failed / latencies.length : 0,
    statuses,
    errors,
    failedRoutes,
    // Busiest generator process, as a percent of one core
    generatorCpu: Math.round(
      Math.max(...outputs.map((o) => o.cpuMs / STEP_MS)) * 100,
    ),
  };
}

// Open loop: one publish every 1000/rate ms, so a slow registry can't slow
// the arrivals down and hide its own saturation
async function publishLoad(
  runId: string,
  rate: number,
  counter: { next: number },
  token: string,
  durationMs = STEP_MS,
  tracker?: VisibilityTracker,
) {
  const results: (PublishResult & { name: string })[] = [];
  const inFlight: Promise<void>[] = [];
  const started = Date.now();
  for (let i = 0; i < Math.round((rate * durationMs) / 1000); i++) {
    const due = started + (i * 1000) / rate;
    if (due > Date.now()) await sleep(due - Date.now());
    const pkg = seedPackage(`stress-${runId}-${counter.next++}`);
    inFlight.push(
      publishSeed(STRESS_NGINX, token, pkg).then((result) => {
        results.push({ ...result, name: pkg.name });
        if (!result.ok) return;
        publishedNames.push(pkg.name);
        tracker?.add({ ...pkg, finishedAt: result.finishedAt });
      }),
    );
  }
  await Promise.all(inFlight);
  return results;
}

const limits = new Map<string, number>();
const publishedNames: string[] = [];

function summarizeUsage(
  sampler: StressSampler,
  from: number,
  to: number,
): Record<string, Usage> {
  const out: Record<string, Usage> = {};
  const window = sampler.usage.filter((s) => s.at >= from && s.at <= to);
  for (const svc of new Set(window.map((s) => s.service))) {
    const own = window.filter((s) => s.service === svc);
    const avgCpu = own.reduce((a, s) => a + s.cpu, 0) / own.length;
    const limit = limits.get(svc) ?? 0;
    out[svc] = {
      cores: Math.round((avgCpu / 100) * (limit || 1) * 100) / 100,
      limit,
      avgCpu: Math.round(avgCpu),
      maxCpu: Math.round(Math.max(...own.map((s) => s.cpu))),
      maxMem: Math.round(Math.max(...own.map((s) => s.mem))),
      maxMemMb: Math.max(...own.map((s) => s.memMb)),
    };
  }
  return out;
}

function summarizePg(sampler: StressSampler, from: number, to: number) {
  const window = sampler.pgSamples.filter((s) => s.at >= from && s.at <= to);
  const max = (pick: (s: (typeof window)[number]) => number) =>
    window.length ? Math.max(...window.map(pick)) : 0;
  return {
    maxConnections: max((s) => s.connections),
    maxActive: max((s) => s.active),
    maxWaiting: max((s) => s.waiting),
    maxQueuedJobs: max((s) => s.queuedJobs),
  };
}

function newRestarts(
  before: ContainerState[],
  after: ContainerState[],
): string[] {
  return after.flatMap((a) => {
    const b = before.find((s) => s.service === a.service);
    const out: string[] = [];
    if (a.oomKilled && !b?.oomKilled) out.push(`${a.service} OOM-killed`);
    if (a.restarts > (b?.restarts ?? 0)) out.push(`${a.service} restarted`);
    if (a.status !== "running" && a.service !== "minio-init") {
      out.push(`${a.service} ${a.status}`);
    }
    return out;
  });
}

// Node runs its JavaScript on one thread, so a registry or worker process is
// saturated at about one core whatever its limit
const NODE_SERVICES = /^(registry-\d+|worker)$/;
const EVENT_LOOP_CORES = 0.9;

function saturation(svc: string, u: Usage): number {
  const loop = NODE_SERVICES.test(svc) ? u.cores / EVENT_LOOP_CORES : 0;
  return Math.max(u.avgCpu / SATURATED_CPU, loop, u.maxMem / SATURATED_MEM);
}

function saturatedServices(usage: Record<string, Usage>): string[] {
  return Object.entries(usage)
    .filter(([svc, u]) => saturation(svc, u) >= 1)
    .sort(([sa, a], [sb, b]) => saturation(sb, b) - saturation(sa, a))
    .map(([svc, u]) => {
      if (u.maxMem >= SATURATED_MEM) {
        return `${svc} (memory ${u.maxMem}% of limit)`;
      }
      if (NODE_SERVICES.test(svc) && u.cores >= EVENT_LOOP_CORES) {
        return `${svc} (event loop: ${u.cores} cores of one thread)`;
      }
      return `${svc} (CPU ${u.cores} of ${u.limit} cores)`;
    });
}

async function publishLag(
  sampler: StressSampler,
  results: (PublishResult & { name: string })[],
) {
  const ok = results.filter((r) => r.ok);
  if (ok.length === 0) return { ready: 0, backlog: 0, p95: null };
  const rows = await sampler.query<{
    package: string;
    status: string;
    at: string;
  }>(
    `SELECT package, status, (extract(epoch FROM updated_at) * 1000)::bigint AS at
       FROM registry_versions WHERE package = ANY($1)`,
    [ok.map((r) => r.name)],
  );
  const byName = new Map(rows.rows.map((r) => [r.package, r]));
  const lags: number[] = [];
  let backlog = 0;
  for (const r of ok) {
    const row = byName.get(r.name);
    if (row?.status === "ready") lags.push(Number(row.at) - r.finishedAt);
    else backlog++;
  }
  lags.sort((a, b) => a - b);
  return {
    ready: lags.length,
    backlog,
    p95: lags.length ? Math.max(0, pct(lags, 95)) : null,
  };
}

// Legacy: lag to the first replica stands in for processing; the rest is divergence
async function legacyLag(tracker: VisibilityTracker) {
  const results = await tracker.settle({
    timeoutMs: 120_000,
    settleMs: 30_000,
  });
  const first = results
    .flatMap((r) => (r.firstMs === null ? [] : [r.firstMs]))
    .sort((a, b) => a - b);
  // A version missing from a replica counts as an infinite lag
  const all = results.map((r) => r.allMs ?? Infinity).sort((a, b) => a - b);
  const allP95 = all.length ? pct(all, 95) : null;
  const lost = results.length - first.length;
  return {
    ready: first.length,
    backlog: lost,
    p95: first.length ? pct(first, 95) : null,
    // Until the last version was on some replica
    drainMs: lost === 0 ? (first.at(-1) ?? 0) : null,
    everyP95: allP95 === Infinity ? null : allP95,
    notOnEvery: results.filter((r) => r.allMs === null).length,
  };
}

async function drain(sampler: StressSampler, timeoutMs = 120_000) {
  if (LEGACY) return 0;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await sampler.query<{ n: string }>(
      "SELECT count(*) AS n FROM registry_jobs",
    );
    if (Number(res.rows[0].n) === 0) return Date.now() - started;
    await sleep(1000);
  }
  return null;
}

async function errorLines(
  stack: StressStack,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const services = LEGACY
    ? ["registry-1", "registry-2", "pgbouncer", "postgres", "nginx"]
    : ["registry-1", "registry-2", "worker", "pgbouncer", "postgres", "nginx"];
  for (const svc of services) {
    const res = await stack.logs(svc);
    const lines = res.stdout
      .split("\n")
      // Skip configuration echoed at start, like pgbouncer's commented defaults
      .filter((l) => !/\|\s*#/.test(l))
      .filter((l) =>
        /error|fatal|timeout|refused|too many|killed|ECONN/i.test(l),
      )
      .slice(-8);
    if (lines.length > 0) out[svc] = lines;
  }
  return out;
}

async function scenario(
  name: string,
  stack: StressStack,
  sampler: StressSampler,
  seeds: SeedPackage[],
  token: string,
  runId: string,
  counter: { next: number },
): Promise<ScenarioResult> {
  const steps: Step[] = [];
  const isPublish = name === "publish";
  let breakingLevel: number | null = null;
  let logs: Record<string, string[]> = {};

  for (const level of isPublish ? PUBLISH_LEVELS : READ_LEVELS) {
    log(`[${name}] level ${level}`);
    const before = await stack.states();
    const from = Date.now();
    let step: Step;
    if (isPublish) {
      const tracker = LEGACY
        ? new VisibilityTracker(STRESS_REPLICAS)
        : undefined;
      const results = await publishLoad(
        runId,
        level,
        counter,
        token,
        STEP_MS,
        tracker,
      );
      const to = Date.now();
      const legacy = tracker ? await legacyLag(tracker) : null;
      const drainMs = legacy ? legacy.drainMs : await drain(sampler);
      const lag = legacy ?? (await publishLag(sampler, results));
      const ms = results.map((r) => r.ms).sort((a, b) => a - b);
      const failed = results.filter((r) => !r.ok);
      const statuses: Record<string, number> = {};
      for (const r of results)
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      step = {
        scenario: name,
        level,
        requests: results.length,
        rps: Math.round((results.length / (STEP_MS / 1000)) * 10) / 10,
        p50: Math.round(pct(ms, 50)),
        p95: Math.round(pct(ms, 95)),
        p99: Math.round(pct(ms, 99)),
        errorRate: results.length ? failed.length / results.length : 0,
        statuses,
        errors: Object.fromEntries(
          [...new Set(failed.map((f) => f.error ?? String(f.status)))].map(
            (e) => [
              e,
              failed.filter((f) => (f.error ?? String(f.status)) === e).length,
            ],
          ),
        ),
        failedRoutes: {},
        generatorCpu: 0,
        usage: summarizeUsage(sampler, from, to),
        postgres: summarizePg(sampler, from, to),
        publish: {
          published: results.length - failed.length,
          failed: failed.length,
          readyAfterDrain: lag.ready,
          unprocessed: lag.backlog,
          p95LagMs: lag.p95,
          drainMs,
          ...(legacy
            ? {
                everyReplicaP95LagMs: legacy.everyP95,
                notOnEveryReplica: legacy.notOnEvery,
              }
            : {}),
        },
        restarts: [],
        saturated: [],
        broke: [],
      };
    } else {
      const publishers =
        name === "mixed"
          ? publishLoad(runId, MIXED_PUBLISH_RATE, counter, token)
          : Promise.resolve([]);
      const reads = await readLoad(seeds, level, name !== "reads-cached");
      await publishers;
      const to = Date.now();
      step = {
        scenario: name,
        level,
        ...reads,
        usage: summarizeUsage(sampler, from, to),
        postgres: summarizePg(sampler, from, to),
        restarts: [],
        saturated: [],
        broke: [],
      };
    }
    step.restarts = newRestarts(before, await stack.states());
    step.saturated = saturatedServices(step.usage);
    if (step.errorRate > MAX_ERROR_RATE) {
      step.broke.push(`${(step.errorRate * 100).toFixed(1)}% failed`);
    }
    if (step.p99 > MAX_P99_MS) step.broke.push(`p99 ${step.p99} ms`);
    if (step.restarts.length > 0) step.broke.push(...step.restarts);
    if (
      step.publish &&
      step.publish.p95LagMs !== null &&
      step.publish.p95LagMs > MAX_LAG_MS
    ) {
      step.broke.push(`processing lag p95 ${step.publish.p95LagMs} ms`);
    }
    if (step.publish && step.publish.drainMs === null) {
      step.broke.push(
        LEGACY
          ? `${step.publish.unprocessed} versions on no replica after 120 s`
          : "job backlog did not drain in 120 s",
      );
    }
    if (step.publish?.notOnEveryReplica) {
      step.diverged = `${step.publish.notOnEveryReplica} of ${step.publish.published} versions never reached every replica`;
    }
    steps.push(step);
    log(
      `[${name}] ${level}: ${step.rps}/s p99 ${step.p99} ms, ${(step.errorRate * 100).toFixed(2)}% failed` +
        (step.saturated.length
          ? `, saturated: ${step.saturated.join(", ")}`
          : "") +
        (step.diverged ? `, diverged: ${step.diverged}` : "") +
        (step.broke.length ? ` → BROKE (${step.broke.join("; ")})` : ""),
    );
    if (step.broke.length > 0) {
      breakingLevel = level;
      logs = await errorLines(stack);
      break;
    }
    const generators = Math.min(MAX_GENERATORS, Math.ceil(level / 8));
    if (
      !isPublish &&
      generators === MAX_GENERATORS &&
      step.generatorCpu >= GENERATOR_CPU
    ) {
      log(
        `[${name}] load generator at ${step.generatorCpu}% of a core; stopping`,
      );
      break;
    }
  }

  const last = steps.at(-1);
  const firstToBreak =
    breakingLevel === null
      ? null
      : (last?.saturated[0] ??
        (last?.restarts[0] ||
          (Object.keys(logs).length > 0
            ? `no container saturated; errors logged by ${Object.keys(logs).join(", ")}`
            : "no container saturated")));
  const saturatedStep = steps.find((s) => s.saturated.length > 0);
  const firstSaturated = saturatedStep
    ? { level: saturatedStep.level, services: saturatedStep.saturated }
    : null;
  return {
    scenario: name,
    steps,
    breakingLevel,
    firstToBreak,
    firstSaturated,
    logs,
  };
}

interface LegacyNotes {
  seeds: number;
  /** Seeds every replica served after seeding, and after a rollout */
  seedsOnEvery: number;
  seedsOnEveryAfterRollout: number;
  /** Seeds no replica served after the rollout */
  seedsLostAfterRollout: number;
  /** Published names missing from verdaccio's S3 package list at the end */
  missingFromS3List: number | null;
  published: number;
}

function markdown(
  ref: string,
  sha: string,
  results: ScenarioResult[],
  notes: LegacyNotes | null,
): string {
  const lines = [
    `# Registry stress test (${ref}, ${sha}${LEGACY ? ", legacy" : ""})`,
    "",
    ...(LEGACY
      ? [
          "The verdaccio registry as dev deploys it (`docker/compose.stress-legacy.yml`): each replica serves its own publishes from its own `/data`, with no worker. Processing lag is the time until the first replica serves `/pieces/<name>?version=` for a published version, and a backlog is a version no replica serves after 120 s. A version that never reaches every replica is reported as divergence and does not stop the ramp.",
          "",
        ]
      : []),
    `Steps of ${STEP_MS / 1000} s; read levels are concurrent clients, publish levels are publishes per second. A step breaks at >${MAX_ERROR_RATE * 100}% failures, p99 > ${MAX_P99_MS} ms, a restart or OOM kill, or (publishing) a processing lag p95 > ${MAX_LAG_MS / 1000} s or a backlog that won't drain. Usage is cores used / the container's CPU limit, and peak memory as a percent of its limit. A registry or worker process is saturated at about one core, since Node runs its JavaScript on one thread.`,
    "",
  ];
  for (const r of results) {
    lines.push(
      `## ${r.scenario}`,
      "",
      r.breakingLevel === null
        ? "Did not break within the tested range."
        : `**Broke at ${r.breakingLevel}** (${r.steps.at(-1)?.broke.join("; ")}). **First to break: ${r.firstToBreak}.**`,
      "",
      r.firstSaturated
        ? `First to saturate: ${r.firstSaturated.services.join(", ")} at ${r.firstSaturated.level}.`
        : "Nothing saturated.",
      "",
    );
    const services = [...new Set(r.steps.flatMap((s) => Object.keys(s.usage)))]
      .filter((s) => s !== "minio-init")
      .sort();
    lines.push(
      `| Level | req/s | p50 / p95 / p99 ms | Failed | ${services.map((s) => `${s} cores / mem %`).join(" | ")} | PG conns / jobs |${r.scenario === "publish" ? " Lag p95 / drain |" : ""}${r.scenario === "publish" && LEGACY ? " Every replica p95 / missing |" : ""}`,
      `|---|---|---|---|${services.map(() => "---").join("|")}|---|${r.scenario === "publish" ? "---|" : ""}${r.scenario === "publish" && LEGACY ? "---|" : ""}`,
    );
    for (const s of r.steps) {
      const cells = services.map((svc) => {
        const u = s.usage[svc];
        return u ? `${u.cores}/${u.limit} · ${u.maxMem}%` : "-";
      });
      const pub = s.publish
        ? ` ${s.publish.p95LagMs ?? "-"} ms / ${s.publish.drainMs ?? "never"} ms |` +
          (LEGACY
            ? ` ${s.publish.everyReplicaP95LagMs === null || s.publish.everyReplicaP95LagMs === undefined ? "never" : `${s.publish.everyReplicaP95LagMs} ms`} / ${s.publish.notOnEveryReplica ?? 0} |`
            : "")
        : "";
      lines.push(
        `| ${s.level}${s.broke.length ? " ✗" : ""} | ${s.rps} | ${Math.round(s.p50)} / ${Math.round(s.p95)} / ${Math.round(s.p99)} | ${(s.errorRate * 100).toFixed(2)}% | ${cells.join(" | ")} | ${s.postgres.maxConnections} / ${s.postgres.maxQueuedJobs} |${pub}`,
      );
    }
    const last = r.steps.at(-1);
    const diverged = r.steps.find((s) => s.diverged);
    if (diverged) {
      lines.push(
        "",
        `Replicas diverged from level ${diverged.level}: ${diverged.diverged}.`,
      );
    }
    if (
      last &&
      (Object.keys(last.errors).length || Object.keys(last.failedRoutes).length)
    ) {
      lines.push(
        "",
        `Failures at the last step: statuses ${JSON.stringify(last.statuses)}, errors ${JSON.stringify(last.errors)}, by route ${JSON.stringify(last.failedRoutes)}.`,
      );
    }
    if (last && last.generatorCpu >= GENERATOR_CPU) {
      lines.push(
        "",
        `The busiest load generator ran at ${last.generatorCpu}% of a core, so higher levels may be limited by the client.`,
      );
    }
    for (const [svc, errs] of Object.entries(r.logs)) {
      lines.push(
        "",
        `\`${svc}\` errors:`,
        "```",
        ...errs.map((e) => e.slice(0, 240)),
        "```",
      );
    }
    lines.push("");
  }
  if (notes) {
    lines.push(
      "## Legacy consistency",
      "",
      `- Seeds served by every replica after seeding: ${notes.seedsOnEvery} of ${notes.seeds}; after replacing both replicas: ${notes.seedsOnEveryAfterRollout}, with ${notes.seedsLostAfterRollout} on none. Reads use only the seeds every replica serves.`,
      `- Published names missing from verdaccio's S3 package list at the end: ${notes.missingFromS3List ?? "unknown"} of ${notes.published}.`,
      "",
    );
  }
  return lines.join("\n");
}

const refArg = process.argv.slice(2).find((a) => a.startsWith("REF="));
const ref = refArg ? refArg.slice(4) : "HEAD";
const built = await registryImage(ref);
// Without a Renown login, publish as a verdaccio account
const useRenown = hasRenownLogin();
const stack = new StressStack(built.image, ARCH, useRenown);
await stack.down();
await stack.up();
const containerLimits = await stack.limits();
for (const l of containerLimits) limits.set(l.service, l.cpus);
const sampler = new StressSampler(containerLimits, !LEGACY);
await sampler.start();
const results: ScenarioResult[] = [];
let notes: LegacyNotes | null = null;
try {
  const runId = `${Date.now()}`;
  const token = useRenown
    ? (await renownToken(AUDIENCE, 4 * 3600)).token
    : await verdaccioToken(STRESS_NGINX, `stress-${runId}`, `pw-${runId}`);
  const counter = { next: 0 };

  log(`seeding ${SEEDS} packages`);
  const seeds = Array.from({ length: SEEDS }, (_, i) =>
    seedPackage(`stress-seed-${runId}-${i}`),
  );
  for (let i = 0; i < seeds.length; i += 8) {
    const batch = await Promise.all(
      seeds.slice(i, i + 8).map((s) => publishSeed(STRESS_NGINX, token, s)),
    );
    const failed = batch.find((b) => !b.ok);
    if (failed)
      throw new Error(`seeding failed: ${failed.status} ${failed.error}`);
  }
  if ((await drain(sampler)) === null)
    throw new Error("seeds were not processed");
  let readSeeds = seeds;
  if (LEGACY) {
    const visible = async () => {
      const tracker = new VisibilityTracker(STRESS_REPLICAS);
      for (const s of seeds) tracker.add({ ...s, finishedAt: Date.now() });
      return tracker.settle({ timeoutMs: 90_000, settleMs: 30_000 });
    };
    const before = await visible();
    log("replacing replicas so each reloads the seeds from S3");
    await stack.rollout();
    const after = await visible();
    const onEvery = new Set(
      after.filter((r) => r.allMs !== null).map((r) => r.name),
    );
    readSeeds = seeds.filter((s) => onEvery.has(s.name));
    notes = {
      seeds: seeds.length,
      seedsOnEvery: before.filter((r) => r.allMs !== null).length,
      seedsOnEveryAfterRollout: onEvery.size,
      seedsLostAfterRollout: after.filter((r) => r.firstMs === null).length,
      missingFromS3List: null,
      published: 0,
    };
    log(
      `seeds on every replica: ${notes.seedsOnEvery} before, ${onEvery.size} after rollout`,
    );
    if (readSeeds.length === 0) throw new Error("no seed on every replica");
  }

  for (const name of SCENARIOS) {
    results.push(
      await scenario(name, stack, sampler, readSeeds, token, runId, counter),
    );
    // Let queues and caches settle between scenarios
    await drain(sampler);
    await sleep(5000);
  }
  if (notes) {
    const list = await stack.s3PackageList();
    const names = [...seeds.map((s) => s.name), ...publishedNames];
    notes.published = names.length;
    if (list) {
      const listed = new Set(list);
      notes.missingFromS3List = names.filter((n) => !listed.has(n)).length;
    }
  }
} finally {
  await sampler.stop();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `stress-${LEGACY ? "legacy-" : ""}${stamp}`;
  const json = path.join(RESULTS_DIR, `${base}.json`);
  const md = path.join(RESULTS_DIR, `${base}.md`);
  writeFileSync(
    json,
    `${JSON.stringify({ ref, sha: built.sha, arch: ARCH, results, legacy: notes, usage: sampler.usage, postgres: sampler.pgSamples }, null, 2)}\n`,
  );
  writeFileSync(md, `${markdown(ref, built.sha, results, notes)}\n`);
  log(`wrote ${md}`);
  if (!process.env.STRESS_KEEP_STACK) await stack.down();
}
