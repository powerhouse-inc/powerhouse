import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import pg from "pg";

export interface Queryable {
  query<R extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** One connection outside a transaction, for session state such as locks. */
  session<T>(fn: (session: Queryable) => Promise<T>): Promise<T>;
  /** True for the in-process PGlite: one connection, no concurrent builds. */
  readonly embedded: boolean;
  /** Subscribes to NOTIFY on a channel; resolves to an unsubscribe function. */
  listen(
    channel: string,
    onMessage: (payload: string) => void,
  ): Promise<() => Promise<void>>;
  notify(channel: string, payload: string): Promise<void>;
  /** False while a LISTEN connection is down; notifications may be missed. */
  listening(): boolean;
  /** Called after LISTEN reconnects, when notifications may have been missed. */
  onReconnect(fn: () => void): void;
  close(): Promise<void>;
}

// A half-open TCP connection raises no error; a periodic query finds it
const LISTENER_CHECK_MS = 30_000;

export const DEFAULT_POOL_MAX = 10;

// LISTEN needs a session; behind a transaction pooler, pass a direct URL for it
export function createPostgresDatabase(
  connectionString: string,
  listenConnectionString = connectionString,
  poolMax = DEFAULT_POOL_MAX,
): Database {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 10_000,
    max: poolMax,
  });
  // An idle client losing its connection must not crash the process
  pool.on("error", (err) => {
    console.error("[registry] postgres pool error:", err.message);
  });
  const listeners = new Map<string, Set<(payload: string) => void>>();
  let listener: Promise<pg.Client> | undefined;
  let connected = false;
  let everConnected = false;
  let closed = false;
  const reconnectHandlers = new Set<() => void>();

  const dropListener = (client: pg.Client, reason: string) => {
    console.error("[registry] postgres listener lost:", reason);
    connected = false;
    listener = undefined;
    void client.end().catch(() => undefined);
    if (!closed) setTimeout(() => void reconnect(), 1000);
  };

  const connectListener = async (): Promise<pg.Client> => {
    const client = new pg.Client({
      connectionString: listenConnectionString,
      keepAlive: true,
    });
    client.on("notification", (msg) => {
      for (const fn of listeners.get(msg.channel) ?? []) fn(msg.payload ?? "");
    });
    const timers: { check?: ReturnType<typeof setInterval> } = {};
    client.on("error", (err) => {
      clearInterval(timers.check);
      dropListener(client, err.message);
    });
    await client.connect();
    for (const channel of listeners.keys()) {
      await client.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
    }
    const check = setInterval(() => {
      const timeout = setTimeout(() => {
        clearInterval(check);
        dropListener(client, "health check timed out");
      }, 10_000);
      client
        .query("SELECT 1")
        .catch(() => undefined)
        .finally(() => clearTimeout(timeout));
    }, LISTENER_CHECK_MS);
    check.unref();
    timers.check = check;
    client.on("end", () => clearInterval(check));
    connected = true;
    if (everConnected) for (const fn of reconnectHandlers) fn();
    everConnected = true;
    return client;
  };
  const reconnect = async () => {
    if (closed || listener || listeners.size === 0) return;
    listener = connectListener();
    await listener.catch(() => {
      listener = undefined;
      setTimeout(() => void reconnect(), 1000);
    });
  };

  return {
    async query<R extends object>(text: string, params?: unknown[]) {
      return pool.query<R>(text, params);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: <R extends object>(text: string, params?: unknown[]) =>
            client.query<R>(text, params),
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    // The direct URL: a transaction pooler drops session state between queries
    async session<T>(fn: (session: Queryable) => Promise<T>): Promise<T> {
      const client = new pg.Client({
        connectionString: listenConnectionString,
        connectionTimeoutMillis: 10_000,
      });
      client.on("error", (err) => {
        console.error("[registry] postgres session error:", err.message);
      });
      await client.connect();
      try {
        return await fn({
          query: <R extends object>(text: string, params?: unknown[]) =>
            client.query<R>(text, params),
        });
      } finally {
        await client.end().catch(() => undefined);
      }
    },
    embedded: false,
    async listen(channel, onMessage) {
      let set = listeners.get(channel);
      const isNew = !set;
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
      }
      set.add(onMessage);
      listener ??= connectListener();
      const client = await listener;
      if (isNew) await client.query(`LISTEN ${pg.escapeIdentifier(channel)}`);
      return () => {
        set.delete(onMessage);
        return Promise.resolve();
      };
    },
    async notify(channel, payload) {
      await pool.query("SELECT pg_notify($1, $2)", [channel, payload]);
    },
    listening: () => connected || listeners.size === 0,
    onReconnect: (fn) => {
      reconnectHandlers.add(fn);
    },
    async close() {
      closed = true;
      const client = await listener?.catch(() => undefined);
      await client?.end().catch(() => undefined);
      await pool.end();
    },
  };
}

// One in-process Postgres; queries queue on its single connection
export async function createPGliteDatabase(
  dataDir?: string,
): Promise<Database> {
  const db = await PGlite.create({ dataDir, extensions: { pg_trgm } });
  const wrap = (
    q: PGlite | Parameters<Parameters<PGlite["transaction"]>[0]>[0],
  ) =>
    ({
      query: async <R extends object>(text: string, params?: unknown[]) => {
        const result = await q.query<R>(text, params);
        return { rows: result.rows };
      },
    }) satisfies Queryable;
  const base = wrap(db);
  return {
    query: base.query,
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    session: (fn) => fn(base),
    embedded: true,
    listen: async (channel, onMessage) => {
      const unlisten = await db.listen(channel, onMessage);
      return () => unlisten();
    },
    async notify(channel, payload) {
      await db.query("SELECT pg_notify($1, $2)", [channel, payload]);
    },
    // In-process: nothing to lose
    listening: () => true,
    onReconnect: () => undefined,
    close: () => db.close(),
  };
}
