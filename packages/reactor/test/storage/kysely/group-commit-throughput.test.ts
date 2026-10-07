/**
 * Informational throughput benchmark for W0.8 group commit (finding A of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md).
 *
 * The live measurement was ~2 operations per second during bulk sync catch-up
 * on a durable store that flushed its wasm filesystem on every statement. This
 * reproduces the shape of that cost in Node, where PGlite's built-in
 * filesystems do not sync at all: the instance wrapper performs a REAL fsync
 * of a real file in place of the browser's IDBFS `syncfs`, so the comparison
 * is between N durable flushes and one, with genuine SQL and genuine I/O on
 * both sides.
 *
 * Two numbers come out of it. The flush COUNT is exact and asserted, because
 * it is the thing the design controls. The wall-clock ratio is reported and
 * only loosely bounded: it depends on the machine's fsync cost, and the live
 * browser figure (an IDBFS syncfs over a whole Postgres data directory) is far
 * more expensive than a single-file fsync, so the ratio here is a floor on the
 * real one rather than an estimate of it.
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, rmSync } from "node:fs";
import { open as openFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SelfHealingPGliteClient,
  type RecreatablePGliteInstance,
} from "../../../src/storage/kysely/self-healing-pglite-client.js";

const OPERATION_COUNT = 500;
const BATCH_SIZE = 50;

type Instrumented = {
  instance: RecreatablePGliteInstance;
  syncCount: () => number;
};

/**
 * A PGlite instance whose `syncToFs` really makes something durable, and which
 * calls it after every statement the way PGlite does.
 */
async function instrumented(dir: string): Promise<Instrumented> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(
    "create table ops (ordinal int primary key, document_id text, payload jsonb)",
  );
  const handle = await openFile(join(dir, "durable.bin"), "w");
  const payload = Buffer.alloc(4096, 1);
  let syncs = 0;

  const instance: RecreatablePGliteInstance = {
    syncToFs: async () => {
      syncs += 1;
      await handle.write(payload, 0, payload.length, 0);
      await handle.sync();
    },
    query: async (statement: string, params?: unknown[]) => {
      const result = await pg.query(statement, params);
      await instance.syncToFs();
      return result as { rows: unknown[]; affectedRows?: number };
    },
    exec: async (statement: string) => {
      const result = await pg.exec(statement);
      await instance.syncToFs();
      return result;
    },
    isInTransaction: () => pg.isInTransaction(),
    close: async () => {
      await handle.close();
      await pg.close();
    },
  };

  return { instance, syncCount: () => syncs };
}

const INSERT =
  "insert into ops (ordinal, document_id, payload) values ($1, $2, $3)";

function paramsFor(ordinal: number): unknown[] {
  return [
    ordinal,
    `doc-${ordinal % 25}`,
    JSON.stringify({ ordinal, note: "synthetic sync operation" }),
  ];
}

describe("group commit throughput (informational)", () => {
  let dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(`applies ${OPERATION_COUNT} operations with one flush per batch of ${BATCH_SIZE} instead of one per statement`, async () => {
    const perOpDir = mkdtempSync(join(tmpdir(), "group-commit-per-op-"));
    const batchedDir = mkdtempSync(join(tmpdir(), "group-commit-batched-"));
    dirs.push(perOpDir, batchedDir);

    const perOp = await instrumented(perOpDir);
    const perOpClient = new SelfHealingPGliteClient(perOp.instance, {
      onDiagnostic: () => undefined,
    });
    const perOpStart = performance.now();
    for (let ordinal = 0; ordinal < OPERATION_COUNT; ordinal += 1) {
      await perOpClient.query(INSERT, paramsFor(ordinal));
    }
    const perOpMs = performance.now() - perOpStart;

    const batched = await instrumented(batchedDir);
    const batchedClient = new SelfHealingPGliteClient(batched.instance, {
      onDiagnostic: () => undefined,
    });
    batchedClient.setDeferredFlush(true);
    const batchedStart = performance.now();
    for (let ordinal = 0; ordinal < OPERATION_COUNT; ordinal += 1) {
      await batchedClient.query(INSERT, paramsFor(ordinal));
      if ((ordinal + 1) % BATCH_SIZE === 0) {
        await batchedClient.flush();
      }
    }
    await batchedClient.flush();
    const batchedMs = performance.now() - batchedStart;

    const ratio = perOpMs / batchedMs;
    console.info(
      `[group-commit] ${OPERATION_COUNT} ops: flush-per-statement ${perOpMs.toFixed(0)}ms / ${perOp.syncCount()} flushes, batched(${BATCH_SIZE}) ${batchedMs.toFixed(0)}ms / ${batched.syncCount()} flushes, speedup ${ratio.toFixed(2)}x`,
    );

    // The exact, design-controlled number: one flush per batch, not per
    // statement. In the live browser each operation costs several statements,
    // so the real reduction is larger than this ratio of flush counts.
    expect(perOp.syncCount()).toBe(OPERATION_COUNT);
    expect(batched.syncCount()).toBe(OPERATION_COUNT / BATCH_SIZE);

    // Both paths wrote everything; the batched one just acknowledged later.
    const rows = await batchedClient.query(
      "select count(*)::int as n from ops",
    );
    expect(rows.rows).toEqual([{ n: OPERATION_COUNT }]);

    // Generous: a machine with a near-free fsync shrinks the gap, and CI
    // timings are noisy. The flush-count assertions above are the contract.
    expect(ratio).toBeGreaterThan(1);

    await perOpClient.close();
    await batchedClient.close();
  }, 120_000);
});
