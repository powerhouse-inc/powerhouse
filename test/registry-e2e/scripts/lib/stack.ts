import path from "node:path";
import { probe } from "./poll.js";
import { log, run, sleep } from "./sh.js";

const COMPOSE_FILE = path.resolve(
  import.meta.dirname,
  "../../docker/compose.yml",
);

export const NGINX_URL = "http://localhost:4900";
export const REPLICAS = ["registry-1", "registry-2", "registry-3"] as const;
export type Replica = (typeof REPLICAS)[number];
export const REPLICA_URL: Record<Replica, string> = {
  "registry-1": "http://localhost:4901",
  "registry-2": "http://localhost:4902",
  "registry-3": "http://localhost:4903",
};

export interface StackEnv {
  image: string;
  /** "true" verifies Renown bearer tokens, as dev does. */
  authRenown: boolean;
}

export class Stack {
  constructor(private env: StackEnv) {}

  withEnv(env: Partial<StackEnv>): Stack {
    return new Stack({ ...this.env, ...env });
  }

  compose(args: string[], allowFailure = false) {
    return run("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
      env: {
        REGISTRY_IMAGE: this.env.image,
        REGISTRY_AUTH_RENOWN: String(this.env.authRenown),
      },
      allowFailure,
    });
  }

  async up(): Promise<void> {
    log(`stack up (${this.env.image}, renown=${this.env.authRenown})`);
    // One replica creates the schema first, as dev's long-lived database has it;
    // concurrent CREATE TABLE IF NOT EXISTS on an empty one fails a replica.
    await this.compose(["up", "-d", "registry-1"]);
    await waitReady(REPLICA_URL["registry-1"]);
    await this.compose(["up", "-d"]);
    await Promise.all(REPLICAS.map((r) => waitReady(REPLICA_URL[r])));
    await waitReady(NGINX_URL);
  }

  async down(): Promise<void> {
    log("stack down");
    await this.compose(["down", "-v", "--remove-orphans"], true);
  }

  /** Replace a replica with a fresh container and an empty /data. */
  async recreate(
    replica: Replica,
  ): Promise<{ removedAt: number; startedAt: number }> {
    const removedAt = Date.now();
    await this.compose(["rm", "-sf", replica]);
    await this.compose(["up", "-d", "--no-deps", replica]);
    return { removedAt, startedAt: Date.now() };
  }

  /** Verdaccio's shared package list: `verdaccio_packages`, else the S3 file. */
  async s3PackageList(): Promise<string[] | null> {
    const table = await this.compose(
      [
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "registry",
        "-d",
        "registry_db",
        "-At",
        "-c",
        "SELECT name FROM verdaccio_packages",
      ],
      true,
    );
    if (table.code === 0) return table.stdout.split("\n").filter(Boolean);
    const res = await this.compose(
      [
        "exec",
        "-T",
        "minio",
        "sh",
        "-c",
        "mc alias set l http://localhost:9000 minioadmin minioadmin >/dev/null && mc cat l/powerhouse-registry/dev/verdaccio-s3-db.json",
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

  /** `registry_package_owners`, package name to owners. */
  async ownerRows(): Promise<Record<string, string[]>> {
    const res = await this.compose(
      [
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "registry",
        "-d",
        "registry_db",
        "-At",
        "-c",
        "SELECT package_name || '=' || array_to_string(owners, ',') FROM registry_package_owners",
      ],
      true,
    );
    const rows: Record<string, string[]> = {};
    if (res.code !== 0) return rows;
    for (const line of res.stdout.split("\n").filter(Boolean)) {
      const at = line.indexOf("=");
      rows[line.slice(0, at)] = line.slice(at + 1).split(",");
    }
    return rows;
  }

  async logs(service: string): Promise<string> {
    return (await this.compose(["logs", "--no-color", service], true)).stdout;
  }
}

/** Waits until `/-/ping` answers 200; returns when it did. */
export async function waitReady(
  base: string,
  timeoutMs = 120_000,
): Promise<number> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const sample = await probe(`${base}/-/ping`, 2000);
    if (sample.status === 200) return Date.now();
    await sleep(100);
  }
  throw new Error(`${base} not ready after ${timeoutMs} ms`);
}
