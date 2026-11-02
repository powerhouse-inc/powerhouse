import {
  HardenedPGliteDialect,
  PGliteSessionPoisonedError,
  type PGliteSession,
} from "@powerhousedao/reactor";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import type { ThreadedPGlite } from "../../../src/pglite/worker/threaded-pglite.js";
import { BOOT_TIMEOUT_MS, startThreadedPGlite } from "./helpers.js";

const STATEMENT_TIMEOUT_MS = 500;
const AHEAD_SECONDS = 1.5;

type Poisoning = { causes: Error[] };

function dialectDb(session: PGliteSession, poisoning: Poisoning) {
  return new Kysely<Record<string, never>>({
    dialect: new HardenedPGliteDialect(session, {
      statementTimeoutMs: STATEMENT_TIMEOUT_MS,
      onPoisoned: (cause) => poisoning.causes.push(cause),
      onDiagnostic: () => undefined,
    }),
  });
}

/** The stand-in without its admission hook: how the store behaved before `admit`. */
function withoutAdmission(pg: ThreadedPGlite): PGliteSession {
  return {
    query: (text, params) => pg.query(text, params),
    exec: (text) => pg.exec(text),
    isInTransaction: () => pg.isInTransaction(),
  };
}

describe("ThreadedPGlite admission", () => {
  const open: ThreadedPGlite[] = [];

  afterEach(async () => {
    for (const pg of open.splice(0)) {
      await pg.terminate();
    }
  });

  async function start(): Promise<ThreadedPGlite> {
    const pg = startThreadedPGlite();
    open.push(pg);
    await pg.waitReady;
    return pg;
  }

  it(
    "reports memory while a reservation holds the queue",
    async () => {
      const pg = await start();
      const answered = await pg.admit(() => pg.memoryStats());
      expect(answered.heapUsed).toBeGreaterThan(0);
      expect(answered.wasm).toBeGreaterThan(1024 * 1024);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "does not count time queued behind a long statement against the deadline",
    async () => {
      const pg = await start();
      const poisoning: Poisoning = { causes: [] };
      const db = dialectDb(pg, poisoning);

      const ahead = pg.query(`select pg_sleep(${AHEAD_SECONDS})`);
      const started = performance.now();
      const { rows } = await sql<{ v: number }>`select 1 as v`.execute(db);
      const waitedMs = performance.now() - started;

      expect(rows).toEqual([{ v: 1 }]);
      expect(waitedMs).toBeGreaterThan(AHEAD_SECONDS * 1000 - 200);
      expect(poisoning.causes).toEqual([]);
      await ahead;
      await expect(sql`select 2`.execute(db)).resolves.toBeDefined();
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "poisons in the same situation without admission (the bug this fixes)",
    async () => {
      const pg = await start();
      const poisoning: Poisoning = { causes: [] };
      const db = dialectDb(withoutAdmission(pg), poisoning);

      const ahead = pg.query(`select pg_sleep(${AHEAD_SECONDS})`);
      await expect(sql`select 1`.execute(db)).rejects.toBeInstanceOf(
        PGliteSessionPoisonedError,
      );
      expect(poisoning.causes).toHaveLength(1);
      await ahead;
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "still poisons a statement that itself never settles in time",
    async () => {
      const pg = await start();
      const poisoning: Poisoning = { causes: [] };
      const db = dialectDb(pg, poisoning);

      await expect(
        sql`select pg_sleep(${sql.lit(AHEAD_SECONDS)})`.execute(db),
      ).rejects.toBeInstanceOf(PGliteSessionPoisonedError);
      expect(poisoning.causes).toHaveLength(1);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "runs an admitted run's statements before work queued after its admission",
    async () => {
      const pg = await start();
      const order: string[] = [];
      let entered = (): void => undefined;
      const inside = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const admitted = pg.admit(async () => {
        entered();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await pg.query("select pg_sleep(0.2)");
        order.push("admitted");
      });
      await inside;
      const outside = pg
        .query("select 'outside'")
        .then(() => order.push("outside"));
      await Promise.all([admitted, outside]);
      expect(order).toEqual(["admitted", "outside"]);
    },
    BOOT_TIMEOUT_MS,
  );
});
