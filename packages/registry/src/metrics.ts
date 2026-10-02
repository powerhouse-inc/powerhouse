// Prometheus text exposition (format 0.0.4) for GET /-/metrics, without a
// client library: counters and histograms kept in-process, gauges read on scrape
import type { NextFunction, Request, Response } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Queryable } from "./db/database.js";
import { BACKGROUND_PRIORITY, ON_DEMAND_PRIORITY } from "./jobs.js";

type Labels = Record<string, string>;

export interface Sample {
  labels?: Labels;
  value: number;
}

interface Family {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  lines(): Promise<string[]>;
}

const escape = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

function series(name: string, labels: Labels | undefined, value: number) {
  const pairs = Object.entries(labels ?? {}).map(
    ([k, v]) => `${k}="${escape(v)}"`,
  );
  const text = Number.isFinite(value)
    ? String(value)
    : value > 0
      ? "+Inf"
      : value < 0
        ? "-Inf"
        : "NaN";
  return `${name}${pairs.length ? `{${pairs.join(",")}}` : ""} ${text}`;
}

const keyOf = (labels: Labels) => JSON.stringify(Object.entries(labels));

export class Counter {
  private values = new Map<string, Sample>();
  inc(labels: Labels = {}, by = 1): void {
    const key = keyOf(labels);
    const sample = this.values.get(key);
    if (sample) sample.value += by;
    else this.values.set(key, { labels, value: by });
  }
  samples(): Sample[] {
    return [...this.values.values()];
  }
}

export class Histogram {
  private values = new Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >();
  constructor(readonly buckets: number[]) {}
  observe(labels: Labels, value: number): void {
    const key = keyOf(labels);
    let entry = this.values.get(key);
    if (!entry) {
      entry = { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.values.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) entry.counts[i]++;
    }
    entry.sum += value;
    entry.count++;
  }
  lines(name: string): string[] {
    const out: string[] = [];
    for (const { labels, counts, sum, count } of this.values.values()) {
      this.buckets.forEach((le, i) => {
        out.push(
          series(`${name}_bucket`, { ...labels, le: String(le) }, counts[i]),
        );
      });
      out.push(series(`${name}_bucket`, { ...labels, le: "+Inf" }, count));
      out.push(series(`${name}_sum`, labels, sum));
      out.push(series(`${name}_count`, labels, count));
    }
    return out;
  }
}

export class Metrics {
  private families: Family[] = [];
  private closers: (() => void)[] = [];

  counter(name: string, help: string): Counter {
    const counter = new Counter();
    this.families.push({
      name,
      help,
      type: "counter",
      lines: () =>
        Promise.resolve(
          counter.samples().map((s) => series(name, s.labels, s.value)),
        ),
    });
    return counter;
  }

  histogram(name: string, help: string, buckets: number[]): Histogram {
    const histogram = new Histogram(buckets);
    this.families.push({
      name,
      help,
      type: "histogram",
      lines: () => Promise.resolve(histogram.lines(name)),
    });
    return histogram;
  }

  // Read on scrape; `counter` for totals kept elsewhere, such as CPU time
  gauge(
    name: string,
    help: string,
    collect: () => Sample[] | Promise<Sample[]>,
    type: "gauge" | "counter" = "gauge",
  ): void {
    this.families.push({
      name,
      help,
      type,
      lines: async () =>
        (await collect()).map((s) => series(name, s.labels, s.value)),
    });
  }

  onClose(fn: () => void): void {
    this.closers.push(fn);
  }

  // A family that fails to collect is left out rather than failing the scrape
  async render(): Promise<string> {
    const blocks = await Promise.all(
      this.families.map(async (family) => {
        const lines = await family.lines().catch((err: unknown) => {
          console.error(`[registry] metric ${family.name}:`, err);
          return null;
        });
        if (!lines) return "";
        return [
          `# HELP ${family.name} ${family.help}`,
          `# TYPE ${family.name} ${family.type}`,
          ...lines,
        ].join("\n");
      }),
    );
    return `${blocks.filter(Boolean).join("\n")}\n`;
  }

  close(): void {
    for (const fn of this.closers.splice(0)) fn();
  }
}

export const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const SECONDS_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
];
const JOB_BUCKETS = [
  0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 1800,
];
// Queue gauges query Postgres; a burst of scrapes shares one result
const QUEUE_CACHE_MS = 5_000;
// Catalog counts move slowly and scan more rows
const CATALOG_CACHE_MS = 30_000;

/** Event-loop delay, memory and CPU of this process. */
export function processMetrics(metrics: Metrics): void {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  metrics.onClose(() => loop.disable());
  // Since the last scrape, so a spike shows once rather than forever
  metrics.gauge(
    "nodejs_eventloop_delay_seconds",
    "Event-loop delay since the previous scrape",
    () => {
      const toSeconds = (ns: number) => (Number.isFinite(ns) ? ns / 1e9 : 0);
      const samples: Sample[] = [
        { labels: { quantile: "0.5" }, value: toSeconds(loop.percentile(50)) },
        { labels: { quantile: "0.9" }, value: toSeconds(loop.percentile(90)) },
        { labels: { quantile: "0.99" }, value: toSeconds(loop.percentile(99)) },
        { labels: { quantile: "1" }, value: toSeconds(loop.max) },
      ];
      loop.reset();
      return samples;
    },
  );
  metrics.gauge("process_resident_memory_bytes", "Resident set size", () => [
    { value: process.memoryUsage.rss() },
  ]);
  metrics.gauge("nodejs_heap_bytes", "V8 heap", () => {
    const m = process.memoryUsage();
    return [
      { labels: { space: "used" }, value: m.heapUsed },
      { labels: { space: "total" }, value: m.heapTotal },
      { labels: { space: "external" }, value: m.external },
      { labels: { space: "array_buffers" }, value: m.arrayBuffers },
    ];
  });
  metrics.gauge(
    "process_cpu_seconds_total",
    "User and system CPU time",
    () => {
      const { user, system } = process.cpuUsage();
      return [{ value: (user + system) / 1e6 }];
    },
    "counter",
  );
  const started = Date.now() / 1000 - process.uptime();
  metrics.gauge("process_start_time_seconds", "Process start time", () => [
    { value: started },
  ]);
}

/** Queue depth, oldest due job and the LISTEN connection, read on scrape. */
export function databaseMetrics(
  metrics: Metrics,
  db: Queryable & { listening(): boolean },
): void {
  let cached:
    | {
        at: number;
        rows: Promise<
          {
            priority: number;
            queued: number;
            due: number;
            running: number;
            oldest_due: number | null;
          }[]
        >;
      }
    | undefined;
  const queue = () => {
    if (!cached || Date.now() - cached.at > QUEUE_CACHE_MS) {
      const rows = db
        .query<{
          priority: number;
          queued: number;
          due: number;
          running: number;
          oldest_due: number | null;
        }>(
          `SELECT priority, count(*)::int AS queued,
                  count(*) FILTER (WHERE run_after <= now() AND locked_by IS NULL)::int AS due,
                  count(*) FILTER (WHERE locked_by IS NOT NULL)::int AS running,
                  extract(epoch FROM now() - min(run_after)
                    FILTER (WHERE run_after <= now() AND locked_by IS NULL))::float8 AS oldest_due
             FROM registry_jobs GROUP BY priority`,
        )
        .then((r) => r.rows);
      cached = { at: Date.now(), rows };
      rows.catch(() => (cached = undefined));
    }
    return cached.rows;
  };
  // Every known priority reports, at 0 while it has no jobs, so an empty queue
  // still has series
  const byPriority =
    (field: "queued" | "due" | "running" | "oldest_due") => async () => {
      const values = new Map<number, number>(
        [0, ON_DEMAND_PRIORITY, BACKGROUND_PRIORITY].map((p) => [p, 0]),
      );
      for (const row of await queue()) {
        values.set(row.priority, Number(row[field] ?? 0));
      }
      return [...values].map(([priority, value]) => ({
        labels: { priority: String(priority) },
        value,
      }));
    };
  metrics.gauge(
    "registry_jobs",
    "Jobs in the queue, by priority",
    byPriority("queued"),
  );
  metrics.gauge(
    "registry_jobs_due",
    "Jobs ready to run and not claimed, by priority",
    byPriority("due"),
  );
  metrics.gauge(
    "registry_jobs_running",
    "Jobs a worker has claimed, by priority",
    byPriority("running"),
  );
  metrics.gauge(
    "registry_jobs_oldest_due_seconds",
    "Age of the oldest unclaimed due job, by priority",
    byPriority("oldest_due"),
  );
  metrics.gauge(
    "registry_listen_connected",
    "1 while the LISTEN connection is up",
    () => [{ value: db.listening() ? 1 : 0 }],
  );

  let catalogCached: { at: number; row: Promise<CatalogCounts> } | undefined;
  const catalog = () => {
    if (!catalogCached || Date.now() - catalogCached.at > CATALOG_CACHE_MS) {
      const row = db
        .query<CatalogCounts>(
          `SELECT
             (SELECT count(*) FROM registry_packages WHERE local)::int AS local,
             (SELECT count(*) FROM registry_packages
               WHERE local AND listed_manifest IS NOT NULL)::int AS listed,
             count(*) FILTER (WHERE status = 'ready')::int AS ready,
             count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE status = 'failed' AND NOT permanent)::int AS failed,
             count(*) FILTER (WHERE status = 'failed' AND permanent)::int AS failed_permanent
             FROM registry_versions`,
        )
        .then((r) => r.rows[0]);
      catalogCached = { at: Date.now(), row };
      row.catch(() => (catalogCached = undefined));
    }
    return catalogCached.row;
  };
  metrics.gauge(
    "registry_packages",
    "Packages published here (local), and those /packages lists (listed)",
    async () => {
      const row = await catalog();
      return (["local", "listed"] as const).map((state) => ({
        labels: { state },
        value: row[state],
      }));
    },
  );
  metrics.gauge(
    "registry_versions",
    "Processed versions, by status; failed_permanent is never retried",
    async () => {
      const row = await catalog();
      return (["ready", "pending", "failed", "failed_permanent"] as const).map(
        (status) => ({ labels: { status }, value: row[status] }),
      );
    },
  );
}

interface CatalogCounts {
  local: number;
  listed: number;
  ready: number;
  pending: number;
  failed: number;
  failed_permanent: number;
}

/** A bounded label for why a job failed. */
export function errorReason(err: unknown, permanent = false): string {
  const name = (err as { name?: string }).name ?? "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "SlowDown" || /reduce your request rate/i.test(message)) {
    return "s3_throttled";
  }
  if (permanent) return "permanent";
  if (/returned 404/.test(message)) return "not_found";
  if (name === "TimeoutError" || /timed? ?out/i.test(message)) return "timeout";
  return "other";
}

/** What a worker records about the jobs it runs. */
export interface WorkerMetrics {
  jobDuration: Histogram;
  jobErrors: Counter;
  reconcileQueued: Counter;
  reconcileRuns: Counter;
}

export function workerMetrics(metrics: Metrics): WorkerMetrics {
  return {
    jobDuration: metrics.histogram(
      "registry_job_duration_seconds",
      "Time to run a job, by kind and outcome (done, retry, failed)",
      JOB_BUCKETS,
    ),
    jobErrors: metrics.counter(
      "registry_job_errors_total",
      "Job failures, by kind and reason (s3_throttled, not_found, timeout, permanent, other)",
    ),
    reconcileQueued: metrics.counter(
      "registry_reconcile_queued_total",
      "Jobs reconcile queued, by pass (quick, full)",
    ),
    reconcileRuns: metrics.counter(
      "registry_reconcile_runs_total",
      "Reconcile passes, by pass (quick, full)",
    ),
  };
}

// Bounded label values: a handful of route groups and status classes
export function routeGroup(method: string, path: string): string {
  if (path.startsWith("/-/cdn/")) return "cdn";
  if (path.startsWith("/-/pieces/bundled/")) return "piece-bundle";
  if (path === "/pieces" || path.startsWith("/pieces/")) return "pieces";
  if (path === "/packages" || path.startsWith("/packages/")) return "packages";
  if (path === "/-/events") return "events";
  if (path === "/-/live" || path === "/-/ready" || path === "/-/ping") {
    return "health";
  }
  if (path === "/-/metrics") return "metrics";
  if (path.startsWith("/-/user/") || path === "/-/whoami") return "auth";
  if (path.startsWith("/-/static/") || path === "/" || path === "/favicon.ico")
    return "web";
  if (/\/-\/[^/]+\.tgz$/.test(path)) return "tarball";
  if (path.startsWith("/-/")) return "other";
  if (method === "PUT" || method === "DELETE") return "npm-write";
  return "npm-metadata";
}

/** Counts and times requests by route group; SSE streams are only counted. */
export function httpMetrics(metrics: Metrics) {
  const requests = metrics.counter(
    "registry_http_requests_total",
    "HTTP requests, by route group, method and status class",
  );
  const duration = metrics.histogram(
    "registry_http_request_duration_seconds",
    "HTTP response time, by route group",
    SECONDS_BUCKETS,
  );
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const route = routeGroup(req.method, req.path);
    res.once("finish", () => {
      const status = `${Math.floor(res.statusCode / 100)}xx`;
      requests.inc({ route, method: req.method, status });
      if (route === "events") return;
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      duration.observe({ route }, seconds);
    });
    next();
  };
}

/** A server that only answers GET /-/metrics, for the worker. */
export async function serveMetrics(
  metrics: Metrics,
  port: number,
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET" || req.url?.split("?")[0] !== "/-/metrics") {
      res.writeHead(404).end();
      return;
    }
    metrics
      .render()
      .then((body) => {
        res.writeHead(200, { "Content-Type": CONTENT_TYPE }).end(body);
      })
      .catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });
  const address = server.address() as AddressInfo;
  console.log(`[registry] metrics on :${address.port}/-/metrics`);
  return server;
}
