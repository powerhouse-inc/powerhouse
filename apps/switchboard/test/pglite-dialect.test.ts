import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
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
