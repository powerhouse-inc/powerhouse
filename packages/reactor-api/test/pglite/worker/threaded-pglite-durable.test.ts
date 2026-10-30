import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ThreadedPGlite } from "../../../src/pglite/worker/threaded-pglite.js";
import {
  ABORT_BOOTSTRAP,
  BOOT_TIMEOUT_MS,
  SIMULATE_ABORT_SQL,
  memoryStore,
  startThreadedPGlite,
} from "./helpers.js";

const DURABLE = {
  fsync: true,
  maintenanceIntervalMs: 0,
  vacuumFullAboveBytes: 0,
  rewriteQuietMs: 0,
};

describe("ThreadedPGlite over DurableNodeFs", () => {
  const dirs: string[] = [];
  const open: ThreadedPGlite[] = [];

  afterEach(async () => {
    for (const pg of open.splice(0)) {
      await pg.terminate();
    }
    for (const dir of dirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function tempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ph-pglite-worker-"));
    dirs.push(dir);
    return path.join(dir, "store");
  }

  function start(dataDir: string, workerScript?: URL): ThreadedPGlite {
    const pg = startThreadedPGlite({
      store: memoryStore({ label: "durable", dataDir, durableFs: DURABLE }),
      ...(workerScript ? { workerScript } : {}),
    });
    open.push(pg);
    return pg;
  }

  it(
    "rewrites a table inside the worker, beside its queue",
    async () => {
      const pg = start(await tempDir());
      await pg.waitReady;
      await pg.exec("create table kept (id int primary key, doc text)");
      await pg.query("insert into kept values ($1, $2)", [1, "x".repeat(5000)]);

      const result = await pg.rewriteTable({
        schema: "public",
        table: "kept",
        requiredFreeBytes: 0,
      });

      expect(result).toMatchObject({ outcome: "done" });
      const { rows } = await pg.query<{ id: number }>("select id from kept");
      expect(rows).toEqual([{ id: 1 }]);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "refuses a rewrite on a store in memory",
    async () => {
      const pg = startThreadedPGlite();
      open.push(pg);
      await pg.waitReady;

      const result = await pg.rewriteTable({
        schema: "public",
        table: "kept",
        requiredFreeBytes: 0,
      });

      expect(result).toMatchObject({ outcome: "refused" });
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "persists across a close and a new worker on the same dir",
    async () => {
      const dataDir = await tempDir();
      const first = start(dataDir);
      await first.waitReady;
      await first.exec(
        "create table kept (id int primary key, doc jsonb, at timestamp)",
      );
      await first.query("insert into kept values ($1, $2, $3)", [
        1,
        { hello: "world" },
        new Date("2024-05-06T07:08:09.000Z"),
      ]);
      await first.close();
      await expect(
        fs.stat(path.join(dataDir, "PG_VERSION")),
      ).resolves.toBeTruthy();

      const second = start(dataDir);
      await second.waitReady;
      const { rows } = await second.query<{
        id: number;
        doc: unknown;
        at: Date;
      }>("select id, doc, at from kept");
      expect(rows).toHaveLength(1);
      expect(rows[0].doc).toEqual({ hello: "world" });
      expect(rows[0].at.toISOString()).toBe("2024-05-06T07:08:09.000Z");
      await second.close();
    },
    BOOT_TIMEOUT_MS * 2,
  );

  it(
    "reports a wasm abort as an event and fails later calls",
    async () => {
      const pg = start(await tempDir(), ABORT_BOOTSTRAP);
      const aborts: string[] = [];
      pg.onAbort((reason) => aborts.push(reason));
      await pg.waitReady;

      await expect(pg.query(SIMULATE_ABORT_SQL)).rejects.toThrow(
        /Aborted\(simulated panic\)/,
      );
      expect(aborts).toEqual(["PGlite aborted: simulated panic"]);
      expect(pg.aborted).toBe("PGlite aborted: simulated panic");

      await expect(pg.query("select 1")).rejects.toThrow(/PGlite aborted/);
      expect(aborts).toHaveLength(1);
      await expect(pg.close()).rejects.toThrow(/PGlite aborted/);
      expect(pg.closed).toBe(true);
    },
    BOOT_TIMEOUT_MS,
  );
});
