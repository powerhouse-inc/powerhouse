import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IN_MEMORY_PGLITE_STORAGE_FACTS,
  PGLITE_PATH_STORAGE_FACTS,
  POSTGRES_STORAGE_FACTS,
} from "@powerhousedao/reactor";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReactorKysely } from "../src/server.mjs";
import { EventEmitter } from "node:events";
import { installFatalErrorShutdown } from "../src/fatal-shutdown.mjs";
import {
  ClosablePGliteDialect,
  reactorPgliteDialectOptions,
} from "../src/pglite-dialect.js";

type Row = { id: number };
type Schema = { t: Row };

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

/** COMMIT on an aborted transaction silently rolls back unless the dialect guards it. */
async function commitOfAnAbortedTransaction(
  db: Kysely<Schema>,
): Promise<{ outcome: unknown; rows: Row[] }> {
  await sql`create table t (id int primary key)`.execute(db);
  const outcome = await db
    .transaction()
    .execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      try {
        await sql`select 1 / 0`.execute(trx);
      } catch {
        /* swallowed, exactly as an unrelated caller would */
      }
      return "JOB-SUCCEEDED";
    })
    .then(
      (value: unknown) => value,
      (error: Error) => ({ error: error.message }),
    );
  const rows = await sql<Row>`select id from t`.execute(db);
  return { outcome, rows: rows.rows };
}

describe("ClosablePGliteDialect", () => {
  const created: PGlite[] = [];

  afterEach(async () => {
    for (const p of created.splice(0)) {
      if (!p.closed) await p.close();
    }
  });

  it("closes the underlying PGlite when the Kysely instance is destroyed", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });

    // Kysely lazy-inits the driver on first query; no query means destroy
    // skips the driver, which would defeat the purpose of this test.
    await sql`select 1`.execute(db);
    expect(pglite.closed).toBe(false);

    await db.destroy();
    expect(pglite.closed).toBe(true);
  });

  it("tolerates a close that rejects because the runtime aborted", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });
    await sql`select 1`.execute(db);
    const realClose = pglite.close.bind(pglite);
    pglite.close = () => {
      pglite.close = realClose;
      return Promise.reject(new Error("PGlite aborted: ENOSPC"));
    };

    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it("rethrows a close that fails for any other reason", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });
    await sql`select 1`.execute(db);
    const realClose = pglite.close.bind(pglite);
    pglite.close = () => {
      pglite.close = realClose;
      return Promise.reject(new Error("disk gone"));
    };

    await expect(db.destroy()).rejects.toThrow("disk gone");
  });

  it("is idempotent if the PGlite is already closed", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely({ dialect: new ClosablePGliteDialect(pglite) });

    await sql`select 1`.execute(db);
    await pglite.close();
    expect(pglite.closed).toBe(true);

    await expect(db.destroy()).resolves.toBeUndefined();
  });

  it("refuses to report a commit for an aborted transaction", async () => {
    const pglite = new PGlite();
    created.push(pglite);
    const db = new Kysely<Schema>({
      dialect: new ClosablePGliteDialect(pglite, {
        onDiagnostic: () => undefined,
      }),
    });

    const { outcome, rows } = await commitOfAnAbortedTransaction(db);
    expect(outcome).not.toBe("JOB-SUCCEEDED");
    expect(rows).toEqual([]);

    await db.destroy();
  });
});

describe("switchboard's reactor storage factory", () => {
  it("builds a PGlite kysely with the commit guard", async () => {
    const storage = await createReactorKysely({
      reactorDbUrl: undefined,
      reactorPgliteDir: ".ph/unused-by-the-in-memory-branch",
      reactorPgliteMajor: 17,
      inMemory: true,
      hostPoolSize: () => {
        throw new Error("the PGlite branch must not read the host pool size");
      },
      logger: stubLogger(),
    });

    const { outcome, rows } = await commitOfAnAbortedTransaction(
      storage.kysely as unknown as Kysely<Schema>,
    );
    expect(outcome).not.toBe("JOB-SUCCEEDED");
    expect(rows).toEqual([]);
    expect(storage.poolInstrumentation).toBeUndefined();

    await storage.kysely.destroy();
  });

  describe("storage facts", () => {
    let dataDir: string | undefined;

    afterEach(async () => {
      if (dataDir) await rm(dataDir, { recursive: true, force: true });
      dataDir = undefined;
    });

    const open = (opts: Partial<Parameters<typeof createReactorKysely>[0]>) =>
      createReactorKysely({
        reactorDbUrl: undefined,
        reactorPgliteDir: ".ph/unused-by-the-in-memory-branch",
        reactorPgliteMajor: 17,
        inMemory: false,
        hostPoolSize: () => 1,
        logger: stubLogger(),
        ...opts,
      });

    // Kysely closes only a driver that has run a query; an unopened PGlite
    // would still be initialising its data dir when afterEach removes it.
    const openAndDestroy = async (
      kysely: Awaited<ReturnType<typeof createReactorKysely>>["kysely"],
    ) => {
      await sql`select 1`.execute(kysely);
      await kysely.destroy();
    };

    it("reports in-memory PGlite as not durable", async () => {
      const storage = await open({ inMemory: true });
      expect(storage.storageFacts).toEqual(IN_MEMORY_PGLITE_STORAGE_FACTS);
      await openAndDestroy(storage.kysely);
    });

    it("reports a PGlite data directory as durable on a path", async () => {
      dataDir = await mkdtemp(join(tmpdir(), "sb-facts-"));
      const storage = await open({ reactorPgliteDir: dataDir });
      expect(storage.storageFacts).toEqual(PGLITE_PATH_STORAGE_FACTS);
      await openAndDestroy(storage.kysely);
    }, 30_000);

    it("reports a Postgres url as a durable server", async () => {
      const storage = await open({
        reactorDbUrl: "postgres://postgres:postgres@127.0.0.1:1/never-dialed",
      });
      expect(storage.storageFacts).toEqual(POSTGRES_STORAGE_FACTS);
      await storage.kysely.destroy();
    });
  });
});

describe("a poisoned reactor PGlite session", () => {
  it("takes the fatal shutdown path", async () => {
    const emitter = new EventEmitter();
    const proc = Object.assign(emitter, {
      pid: 1234,
      exitCode: undefined as number | undefined,
      kill: vi.fn(() => true),
      exit: vi.fn(),
    });
    const logger = stubLogger();
    installFatalErrorShutdown(logger, proc as never);

    const pglite = new PGlite();
    const dead = new Proxy(pglite, {
      get(target, prop, receiver) {
        if (prop === "query") {
          return (text: string, params?: unknown[]) =>
            /dead_call/.test(text)
              ? new Promise(() => undefined)
              : target.query(text, params);
        }
        const value = Reflect.get(target, prop, receiver) as unknown;
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    const db = new Kysely<Schema>({
      dialect: new ClosablePGliteDialect(dead, {
        ...reactorPgliteDialectOptions(logger, proc as never),
        statementTimeoutMs: 50,
      }),
    });

    await expect(sql`select 1 as dead_call`.execute(db)).rejects.toThrow();

    expect(proc.kill).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(proc.exitCode).toBe(1);
    await pglite.close();
  });
});
