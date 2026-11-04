import { isPidAlive } from "@powerhousedao/host-core";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import type { Client } from "pg";

/** The Postgres server the controller hands databases out from. */
export interface DatabaseServer {
  /** The server's own database: what a check, which never connects, is given. */
  readonly url: string;
  create(): Promise<{ name: string; url: string }>;
  drop(name: string): Promise<void>;
}

/** The env var naming the server: `postgres://user:pass@host:port/<prefix>`. */
export const PG_URL_ENV = "PH_MONITOR_PG_URL";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
// 63 bytes, less `_<6 hex>_<pid>_<12 hex>`.
const MAX_PREFIX = 35;
const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_PREFIX = "ph_monitor";

/** The url's database prefixes those made: `<db>_<machine>_<pid>_<hex>`. */
export function databasePrefix(serverUrl: string): string {
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new Error(`${PG_URL_ENV} is not a URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${PG_URL_ENV} must be a postgres:// URL.`);
  }
  const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const prefix = db || DEFAULT_PREFIX;
  if (!IDENTIFIER.test(prefix) || prefix.length > MAX_PREFIX) {
    throw new Error(
      `${PG_URL_ENV}'s database "${prefix}" names the ones the monitor makes: use lowercase letters, digits and _, at most ${MAX_PREFIX}.`,
    );
  }
  return prefix;
}

export function databaseUrl(serverUrl: string, name: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Another machine's pids mean nothing here, so names carry the machine. */
export function machineTag(hostname: string = os.hostname()): string {
  return createHash("sha256").update(hostname).digest("hex").slice(0, 6);
}

/** The pid in a name this prefix made on this machine, if it is one. */
export function ownerOf(
  prefix: string,
  name: string,
  machine: string = machineTag(),
): number | undefined {
  const own = `${prefix}_${machine}_`;
  if (!name.startsWith(own)) return undefined;
  const match = /^(\d+)_[0-9a-f]{12}$/.exec(name.slice(own.length));
  return match ? Number(match[1]) : undefined;
}

// pg's entry requires pg-pool, which the test runner's `import` condition
// resolves to ESM; the client alone loads either way.
const loadClient = () =>
  createRequire(import.meta.url)("pg/lib/client") as typeof Client;

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

async function withClient<T>(
  serverUrl: string,
  run: (query: Query) => Promise<T>,
): Promise<T> {
  const client = new (loadClient())({
    connectionString: serverUrl,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  await client.connect();
  try {
    return await run((sql, params) => client.query(sql, params));
  } finally {
    await client.end().catch(() => undefined);
  }
}

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name))
    throw new Error(`"${name}" can't name a database.`);
}

/** The first create drops gone monitors' databases, like sweepTempRoots. */
export function postgresServer(
  serverUrl: string,
  pid: number = process.pid,
): DatabaseServer {
  const prefix = databasePrefix(serverUrl);
  const machine = machineTag();
  let swept: Promise<void> | undefined;

  const drop = (name: string) => {
    assertIdentifier(name);
    return withClient(serverUrl, async (query) => {
      await query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    });
  };

  const sweep = async () => {
    let names: string[];
    try {
      names = await withClient(serverUrl, async (query) => {
        const { rows } = await query(
          "SELECT datname FROM pg_database WHERE starts_with(datname, $1)",
          [`${prefix}_${machine}_`],
        );
        return rows.map((row) => (row as { datname: string }).datname);
      });
    } catch (error) {
      console.warn("[ph-monitor] could not list old databases:", error);
      return;
    }
    for (const name of names) {
      const owner = ownerOf(prefix, name, machine);
      if (owner === undefined || owner === pid || isPidAlive(owner)) continue;
      try {
        await drop(name);
      } catch (error) {
        console.warn(`[ph-monitor] could not drop ${name}:`, error);
      }
    }
  };

  return {
    url: serverUrl,
    create: async () => {
      swept ??= sweep();
      await swept;
      const name = `${prefix}_${machine}_${pid}_${randomBytes(6).toString("hex")}`;
      await withClient(serverUrl, async (query) => {
        await query(`CREATE DATABASE "${name}"`);
      });
      return { name, url: databaseUrl(serverUrl, name) };
    },
    drop,
  };
}
