import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  GroupCommitPGliteClient,
  PGliteFlushSyncTimeoutError,
  type GroupCommitPGliteClientOptions,
  type GroupCommitPGliteInstance,
} from "../../../src/storage/kysely/group-commit-pglite-client.js";
import { StoragePoisonedError } from "../../../src/storage/storage-flush.js";

/**
 * Writes land in `memory`; only a sync copies them to `durable`, which is what a
 * reopen reads back. Like PGlite it syncs itself after every statement.
 */
class FakeFilesystemInstance implements GroupCommitPGliteInstance {
  readonly memory: string[] = [];
  durable: string[] = [];
  syncCount = 0;
  closed = false;
  syncDelayMs = 0;
  statementDelayMs = 0;
  syncFailure: Error | undefined = undefined;
  hangOn: RegExp | undefined = undefined;
  hangSync = false;

  private readonly base: string[];

  constructor(durable: string[] = []) {
    this.base = [...durable];
    this.durable = [...durable];
  }

  async syncToFs(): Promise<void> {
    this.syncCount += 1;
    if (this.hangSync) {
      await new Promise<void>(() => undefined);
    }
    const snapshot = [...this.memory];
    if (this.syncDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.syncDelayMs));
    }
    if (this.syncFailure !== undefined) {
      throw this.syncFailure;
    }
    this.durable = [...this.base, ...snapshot];
  }

  async query(
    statement: string,
    _params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    if (this.hangOn?.test(statement) === true) {
      await new Promise<void>(() => undefined);
    }
    if (this.statementDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.statementDelayMs),
      );
    }
    this.memory.push(statement);
    await this.syncToFs();
    return { rows: [] };
  }

  async exec(statement: string): Promise<unknown> {
    await this.query(statement);
    return undefined;
  }

  isInTransaction(): boolean {
    return false;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function client(
  instance: FakeFilesystemInstance,
  options: Partial<GroupCommitPGliteClientOptions> = {},
): GroupCommitPGliteClient {
  return new GroupCommitPGliteClient(instance, {
    onDiagnostic: () => undefined,
    ...options,
  });
}

/**
 * PGlite 0.3.15's syncToFs: a call made while one is already scheduled returns
 * at once, and the scheduled one waits on the fs mutex behind the one running.
 */
class ScheduledSyncInstance extends FakeFilesystemInstance {
  private scheduled = false;
  private mutex: Promise<void> = Promise.resolve();

  override syncToFs(): Promise<void> {
    if (this.scheduled) return Promise.resolve();
    this.scheduled = true;
    const run = this.mutex.then(async () => {
      this.scheduled = false;
      await new Promise<void>(() => undefined);
    });
    this.mutex = run.catch(() => undefined);
    return run;
  }
}

describe("GroupCommitPGliteClient", () => {
  it("takes the per-statement sync away and puts one behind flush()", async () => {
    const instance = new FakeFilesystemInstance();
    const gc = client(instance);
    expect(gc.deferringStatementFlush).toBe(true);

    await gc.query("b");
    await gc.query("c");
    expect(instance.syncCount).toBe(0);
    expect(instance.durable).toEqual([]);

    await gc.flush();
    expect(instance.syncCount).toBe(1);
    expect(instance.durable).toEqual(["b", "c"]);
  });

  it("costs one sync per batch instead of one per statement", async () => {
    const instance = new FakeFilesystemInstance();
    const gc = client(instance);
    for (let index = 0; index < 50; index += 1) {
      await gc.query(`op-${index}`);
    }
    await gc.flush();

    expect(instance.syncCount).toBe(1);
    expect(instance.durable).toHaveLength(50);
  });

  it("coalesces concurrent callers, skips an idle flush, and holds statements back while it snapshots", async () => {
    const instance = new FakeFilesystemInstance();
    instance.syncDelayMs = 20;
    const gc = client(instance);

    await gc.query("a");
    await gc.query("b");
    await Promise.all([gc.flush(), gc.flush()]);
    expect(instance.syncCount).toBe(1);

    await gc.flush();
    expect(instance.syncCount).toBe(1);

    await gc.query("c");
    const flushing = gc.flush();
    const writing = gc.query("d");
    await flushing;
    expect(instance.durable).toEqual(["a", "b", "c"]);
    await writing;
    expect(instance.memory).toEqual(["a", "b", "c", "d"]);
    expect(instance.durable).toEqual(["a", "b", "c"]);
  });

  it("gives a caller that arrived after the snapshot started its own sync", async () => {
    const instance = new FakeFilesystemInstance();
    instance.syncDelayMs = 20;
    const gc = client(instance);

    await gc.query("a");
    const first = gc.flush();
    const writing = gc.query("b");
    await first;
    await writing;

    await gc.flush();
    expect(instance.syncCount).toBe(2);
    expect(instance.durable).toEqual(["a", "b"]);
  });

  it("waits for a long statement instead of running a clock of its own", async () => {
    const instance = new FakeFilesystemInstance();
    const gc = client(instance);

    instance.statementDelayMs = 60;
    const long = gc.query("vacuum full");
    const flushing = gc.flush();
    await long;
    await flushing;

    expect(instance.durable).toEqual(["vacuum full"]);
  });

  it("rejects a failed sync, and poisons the session when it keeps failing", async () => {
    const instance = new FakeFilesystemInstance();
    instance.syncFailure = new Error("idb quota exceeded");
    const stuck: Error[] = [];
    const gc = client(instance, {
      maxConsecutiveSyncFailures: 2,
      onSyncStuck: (cause) => void stuck.push(cause),
    });

    await gc.query("a");
    await expect(gc.flush()).rejects.toThrow("idb quota exceeded");
    expect(stuck).toEqual([]);

    await expect(gc.flush()).rejects.toBeInstanceOf(StoragePoisonedError);
    expect(stuck).toHaveLength(1);
    instance.syncFailure = undefined;
    await expect(gc.flush()).rejects.toBeInstanceOf(StoragePoisonedError);
  });

  it("poisons the session on a hung sync and frees every flush parked on it", async () => {
    const instance = new FakeFilesystemInstance();
    instance.hangSync = true;
    const stuck: Error[] = [];
    const gc = client(instance, {
      flushSyncTimeoutMs: 20,
      onSyncStuck: (cause) => void stuck.push(cause),
    });

    await gc.query("a");
    const flushing = gc.flush();
    const joined = gc.flush();
    await expect(flushing).rejects.toBeInstanceOf(StoragePoisonedError);
    await expect(joined).rejects.toBeInstanceOf(StoragePoisonedError);
    expect(stuck[0]).toBeInstanceOf(PGliteFlushSyncTimeoutError);
  });

  it("frees a flush parked behind a dead statement once the session is poisoned", async () => {
    const instance = new FakeFilesystemInstance();
    instance.hangOn = /hung/;
    const gc = client(instance);
    void gc.query("hung").catch(() => undefined);

    const parked = gc.flush();
    gc.markPoisoned(new Error("statement deadline"));
    await expect(parked).rejects.toBeInstanceOf(StoragePoisonedError);
  });

  it("never reports a flush that PGlite's scheduled-sync shortcut skipped", async () => {
    const instance = new ScheduledSyncInstance();
    const gc = client(instance, {
      flushSyncTimeoutMs: 20,
      maxConsecutiveSyncFailures: 99,
    });
    // A sync that times out poisons; keep the session to show the shortcut alone.
    (gc as unknown as { markPoisoned: () => void }).markPoisoned = () =>
      undefined;

    for (const write of ["a", "b", "c"]) {
      await gc.query(write);
      await expect(gc.flush()).rejects.toBeInstanceOf(
        PGliteFlushSyncTimeoutError,
      );
    }
    expect(instance.durable).toEqual([]);
  });

  it("flushes on close and gives the per-statement sync back", async () => {
    const instance = new FakeFilesystemInstance();
    const gc = client(instance);

    await gc.query("tail");
    await gc.close();

    expect(instance.durable).toEqual(["tail"]);
    expect(instance.closed).toBe(true);
    await instance.syncToFs();
    expect(instance.syncCount).toBe(2);
  });

  it("closes within its bound when a statement died in flight", async () => {
    const instance = new FakeFilesystemInstance();
    instance.hangOn = /hung/;
    const gc = client(instance, { closeTimeoutMs: 50 });
    void gc.query("hung").catch(() => undefined);

    const started = Date.now();
    await gc.close();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(instance.closed).toBe(true);
  });
});

describe("GroupCommitPGliteClient over a real PGlite", () => {
  it("takes PGlite's own per-statement sync away and flushes on demand", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    const fs = (pg as unknown as { fs: { syncToFs: () => Promise<void> } }).fs;
    let syncs = 0;
    const original = fs.syncToFs.bind(fs);
    fs.syncToFs = () => {
      syncs += 1;
      return original();
    };
    await pg.query("select 1");
    expect(syncs).toBeGreaterThan(0);

    const gc = new GroupCommitPGliteClient(
      pg as unknown as GroupCommitPGliteInstance,
    );
    syncs = 0;
    await gc.exec("create table t (x int)");
    await gc.query("insert into t values (1)");
    expect(syncs).toBe(0);

    await gc.flush();
    expect(syncs).toBe(1);
    await gc.close();
  });
});
