// The stress stack (docker/compose.stress.yml): per-container usage against
// each limit, restarts and OOM kills, and Postgres' connections and job queue.
import path from "node:path";
import pg from "pg";
import { probe } from "./poll.js";
import { log, run, sleep } from "./sh.js";

// "legacy": the verdaccio registry as dev runs it (docker/compose.stress-legacy.yml)
export type StressArch = "stateless" | "legacy";

const COMPOSE_FILES: Record<StressArch, string> = {
  stateless: path.resolve(
    import.meta.dirname,
    "../../docker/compose.stress.yml",
  ),
  legacy: path.resolve(
    import.meta.dirname,
    "../../docker/compose.stress-legacy.yml",
  ),
};

export const STRESS_NGINX = "http://localhost:4930";
export const STRESS_REPLICAS = [
  "http://localhost:4931",
  "http://localhost:4932",
];
const PG_URL = "postgres://registry:registry@localhost:4940/registry_db";

export interface ContainerLimit {
  service: string;
  cpus: number;
  memMb: number;
}

export interface ContainerState {
  service: string;
  restarts: number;
  oomKilled: boolean;
  status: string;
}

export interface UsageSample {
  at: number;
  service: string;
  /** Percent of the container's CPU limit */
  cpu: number;
  memMb: number;
  /** Percent of the container's memory limit */
  mem: number;
}

export interface PgSample {
  at: number;
  connections: number;
  active: number;
  idleInTransaction: number;
  waiting: number;
  queuedJobs: number;
  pendingVersions: number;
}

function service(name: string): string {
  return name.replace(/^\/?registry-stress-/, "").replace(/-\d+$/, "");
}

export class StressStack {
  constructor(
    private image: string,
    readonly arch: StressArch = "stateless",
    private authRenown = true,
  ) {}

  compose(args: string[], allowFailure = false) {
    // STRESS_COMPOSE_OVERRIDE: an extra compose file, e.g. compose.profile.yml
    const override = process.env.STRESS_COMPOSE_OVERRIDE;
    const files = [
      COMPOSE_FILES[this.arch],
      ...(override ? [path.resolve(override)] : []),
    ];
    return run(
      "docker",
      ["compose", ...files.flatMap((f) => ["-f", f]), ...args],
      {
        env: {
          REGISTRY_IMAGE: this.image,
          REGISTRY_AUTH_RENOWN: String(this.authRenown),
          WORKER_CONCURRENCY: process.env.STRESS_WORKER_CONCURRENCY ?? "8",
        },
        allowFailure,
      },
    );
  }

  /** Replaces the replicas with fresh containers, like a rollout. */
  async rollout(): Promise<void> {
    await this.compose([
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "registry-1",
      "registry-2",
    ]);
    for (const base of STRESS_REPLICAS) await waitPing(base);
  }

  /** Package names in verdaccio's shared S3 package list (legacy). */
  async s3PackageList(): Promise<string[] | null> {
    const res = await this.compose(
      [
        "exec",
        "-T",
        "minio",
        "sh",
        "-c",
        "mc alias set l http://localhost:9000 minioadmin minioadmin >/dev/null && mc cat l/powerhouse-registry/stress/verdaccio-s3-db.json",
      ],
      true,
    );
    if (res.code !== 0) return null;
    try {
      return (JSON.parse(res.stdout) as { list?: string[] }).list ?? [];
    } catch {
      return null;
    }
  }

  async up(): Promise<void> {
    log(`stress stack up (${this.image})`);
    await this.compose(["up", "-d", "registry-1"]);
    await waitPing(STRESS_REPLICAS[0]);
    await this.compose(["up", "-d"]);
    for (const base of [...STRESS_REPLICAS, STRESS_NGINX]) await waitPing(base);
  }

  down() {
    return this.compose(["down", "-v", "--remove-orphans"], true);
  }

  logs(name: string) {
    return this.compose(["logs", "--no-color", "--tail", "400", name], true);
  }

  async containers(): Promise<string[]> {
    const res = await this.compose(["ps", "-q"], true);
    return res.stdout.split("\n").filter(Boolean);
  }

  async limits(): Promise<ContainerLimit[]> {
    const ids = await this.containers();
    const res = await run("docker", [
      "inspect",
      "--format",
      "{{.Name}} {{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}",
      ...ids,
    ]);
    return res.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, nano, mem] = line.split(" ");
        return {
          service: service(name),
          cpus: Number(nano) / 1e9 || 0,
          memMb: Math.round(Number(mem) / 1024 / 1024) || 0,
        };
      });
  }

  async states(): Promise<ContainerState[]> {
    const ids = await this.containers();
    const res = await run(
      "docker",
      [
        "inspect",
        "--format",
        "{{.Name}} {{.RestartCount}} {{.State.OOMKilled}} {{.State.Status}}",
        ...ids,
      ],
      { allowFailure: true },
    );
    return res.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, restarts, oom, status] = line.split(" ");
        return {
          service: service(name),
          restarts: Number(restarts),
          oomKilled: oom === "true",
          status,
        };
      });
  }
}

async function waitPing(base: string, timeoutMs = 120_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await probe(`${base}/-/ping`, 2000)).status === 200) return;
    await sleep(200);
  }
  throw new Error(`${base} not ready after ${timeoutMs} ms`);
}

/** Samples container usage and Postgres in the background. */
export class StressSampler {
  usage: UsageSample[] = [];
  pgSamples: PgSample[] = [];
  #running = false;
  #loops: Promise<void>[] = [];
  #limits = new Map<string, ContainerLimit>();
  #db = new pg.Client({ connectionString: PG_URL });

  /** `queue`: read the job queue, which the legacy registry doesn't have */
  constructor(
    limits: ContainerLimit[],
    private queue = true,
  ) {
    for (const l of limits) this.#limits.set(l.service, l);
  }

  async start(): Promise<void> {
    await this.#db.connect();
    this.#running = true;
    this.#loops = [this.#dockerLoop(), this.#pgLoop()];
  }

  async stop(): Promise<void> {
    this.#running = false;
    await Promise.allSettled(this.#loops);
    await this.#db.end().catch(() => undefined);
  }

  async #dockerLoop(): Promise<void> {
    while (this.#running) {
      const res = await run(
        "docker",
        [
          "stats",
          "--no-stream",
          "--format",
          "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}",
        ],
        { allowFailure: true },
      );
      const at = Date.now();
      for (const line of res.stdout.split("\n")) {
        const [name, cpu, usage, mem] = line.split("\t");
        if (!name?.startsWith("registry-stress-") || !cpu) continue;
        const svc = service(name);
        const limit = this.#limits.get(svc);
        const cores = parseFloat(cpu) / 100;
        const used = usage.split("/")[0].trim();
        const memMb =
          parseFloat(used) *
          (used.includes("GiB") ? 1024 : used.includes("KiB") ? 1 / 1024 : 1);
        this.usage.push({
          at,
          service: svc,
          cpu: limit?.cpus ? (cores / limit.cpus) * 100 : cores * 100,
          memMb: Math.round(memMb),
          mem: parseFloat(mem),
        });
      }
    }
  }

  async #pgLoop(): Promise<void> {
    while (this.#running) {
      try {
        const activity = await this.#db.query<{
          connections: string;
          active: string;
          idle_tx: string;
          waiting: string;
        }>(
          `SELECT count(*) AS connections,
                  count(*) FILTER (WHERE state = 'active') AS active,
                  count(*) FILTER (WHERE state LIKE 'idle in transaction%') AS idle_tx,
                  count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting
             FROM pg_stat_activity WHERE datname = 'registry_db'`,
        );
        const queue = this.queue
          ? await this.#db.query<{ jobs: string; pending: string }>(
              `SELECT (SELECT count(*) FROM registry_jobs) AS jobs,
                      (SELECT count(*) FROM registry_versions WHERE status = 'pending') AS pending`,
            )
          : { rows: [{ jobs: "0", pending: "0" }] };
        const a = activity.rows[0];
        this.pgSamples.push({
          at: Date.now(),
          connections: Number(a.connections),
          active: Number(a.active),
          idleInTransaction: Number(a.idle_tx),
          waiting: Number(a.waiting),
          queuedJobs: Number(queue.rows[0].jobs),
          pendingVersions: Number(queue.rows[0].pending),
        });
      } catch {
        // The tables appear with the first replica's migration
      }
      await sleep(1000);
    }
  }

  query<R extends object>(text: string, params?: unknown[]) {
    return this.#db.query<R>(text, params);
  }
}
