import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtomicNodeFs } from "../src/atomic-node-fs.js";

describe("AtomicNodeFs flush failures", () => {
  const tempDirs: string[] = [];
  const open: PGlite[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const pg of open.splice(0)) {
      if (!pg.closed) await pg.close().catch(() => undefined);
    }
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function start(flushIntervalMs: number) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-flush-"));
    tempDirs.push(dir);
    const onFlushError = vi.fn();
    const warn = vi.fn();
    const atomicFs = new AtomicNodeFs(dir, {
      flushIntervalMs,
      onFlushError,
      logger: { warn },
    });
    const pg = new PGlite({ fs: atomicFs });
    open.push(pg);
    await pg.exec("CREATE TABLE t (v int)");
    await vi.waitFor(() => {
      expect(atomicFs["flushTimer"]).toBeUndefined();
      expect(atomicFs["flushInFlight"]).toBeUndefined();
    });
    return { dir, pg, atomicFs, onFlushError, warn };
  }

  async function reopenRows(dir: string): Promise<number[]> {
    const pg = new PGlite({ fs: new AtomicNodeFs(dir) });
    open.push(pg);
    const { rows } = await pg.query<{ v: number }>(
      "SELECT v FROM t ORDER BY v",
    );
    await pg.close();
    return rows.map((r) => r.v);
  }

  it("sync mode rejects and reports each failure, then recovers", async () => {
    const { dir, pg, onFlushError } = await start(0);

    await fs.rm(dir, { recursive: true });
    await expect(pg.exec("INSERT INTO t VALUES (1)")).rejects.toThrow(/ENOENT/);
    await expect(pg.exec("INSERT INTO t VALUES (2)")).rejects.toThrow(/ENOENT/);
    expect(onFlushError).toHaveBeenCalledTimes(2);

    await fs.mkdir(dir);
    await pg.exec("INSERT INTO t VALUES (3)");
    expect(onFlushError).toHaveBeenCalledTimes(2);
    await pg.close();

    expect(await reopenRows(dir)).toEqual([1, 2, 3]);
  });

  it("deferred mode latches a background failure until a write succeeds", async () => {
    const { dir, pg, atomicFs, onFlushError, warn } = await start(5);

    await fs.rm(dir, { recursive: true });
    await pg.exec("INSERT INTO t VALUES (1)");
    await vi.waitFor(() => expect(onFlushError).toHaveBeenCalledOnce());
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("deferred flush failed"),
    );

    await expect(pg.exec("INSERT INTO t VALUES (2)")).rejects.toThrow(/ENOENT/);
    expect(onFlushError).toHaveBeenCalledTimes(2);

    await fs.mkdir(dir);
    await pg.exec("INSERT INTO t VALUES (3)");
    expect(await fs.stat(path.join(dir, "snapshot.bin"))).toBeTruthy();

    const write = vi.spyOn(
      atomicFs as unknown as { writeSnapshot: () => Promise<void> },
      "writeSnapshot",
    );
    await pg.exec("INSERT INTO t VALUES (4)");
    expect(write).not.toHaveBeenCalled();

    await pg.close();
    expect(onFlushError).toHaveBeenCalledTimes(2);
    expect(await reopenRows(dir)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the flush error when the callback throws", async () => {
    const { dir, pg, onFlushError, warn } = await start(0);
    onFlushError.mockImplementation(() => {
      throw new Error("callback boom");
    });

    await fs.rm(dir, { recursive: true });
    await expect(pg.exec("INSERT INTO t VALUES (1)")).rejects.toThrow(/ENOENT/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("callback boom"));
  });

  it("closeFs closes MEMFS and then surfaces a failed final flush", async () => {
    const { dir, pg, onFlushError } = await start(5);
    open.pop();
    const superClose = vi.spyOn(MemoryFS.prototype, "closeFs");

    await fs.rm(dir, { recursive: true });
    await expect(pg.close()).rejects.toThrow(/ENOENT/);

    expect(superClose).toHaveBeenCalledOnce();
    expect(onFlushError).toHaveBeenCalledOnce();
  });
});
