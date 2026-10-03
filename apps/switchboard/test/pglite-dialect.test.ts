import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createReactorKysely } from "../src/server.mjs";
import { ClosablePGliteDialect } from "../src/pglite-dialect.js";
import type { ILogger } from "document-model";
import { vi } from "vitest";

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

/**
 * The guarantee the raw kysely-pglite-dialect does not give: Postgres answers
 * COMMIT on an aborted transaction with a ROLLBACK command tag and no error,
 * and Kysely never inspects the tag - so the transaction resolves with the
 * callback's value while nothing was written, the job is reported COMPLETED and
 * the sync cursor advances past data that does not exist.
 */
async function commitOfAnAbortedTransaction(
  db: Kysely<Schema>,
): Promise<{ outcome: unknown; rows: Row[] }> {
  await sql`create table t (id int primary key)`.execute(db);
  const outcome = await db
    .transaction()
    .execute(async (trx) => {
      await sql`insert into t (id) values (1)`.execute(trx);
      // Stands in for an interleaved failing statement whose caller swallowed
      // its own error - an inspector query, another consumer of the session.
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
      // Unused by the in-memory branch, but the guard above it insists on one.
      reactorPgliteDir: ".ph/unused-by-the-in-memory-branch",
      reactorPgliteMajor: 17,
      inMemory: true,
      flushIntervalMs: 0,
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
