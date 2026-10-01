import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import { childLogger } from "document-model";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  convertSnapshotDir,
  recoverConversion,
  type ConversionDeps,
  type ConversionStep,
  type VerifyHandle,
} from "../../src/pglite/convert-snapshot-dir.js";
import { writeSnapshotFromDir } from "./snapshot-writer.js";

const CURRENT_MAJOR = 17;
const TEMPLATE_ROWS = 1000;
const RM = { recursive: true, force: true, maxRetries: 10 } as const;
// ControlFileData: u64 ident, u32 version, u32 catalog version, u32 state.
const DB_STATE_OFFSET = 16;
const DB_SHUTDOWNED = 1;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function openNodeFs(dataDir: string): Promise<PGlite> {
  const pg = new PGlite({ fs: new NodeFS(dataDir) });
  await pg.waitReady;
  return pg;
}

async function closeNodeFs(pg: PGlite, dataDir: string): Promise<void> {
  await pg.close();
  await fs.rm(path.join(dataDir, "postmaster.pid"), { force: true });
}

async function openForVerify(
  major: number,
  dataDir: string,
): Promise<VerifyHandle> {
  if (major !== CURRENT_MAJOR) {
    throw new Error(`unsupported PGlite major ${major}`);
  }
  return openNodeFs(dataDir);
}

async function countRows(dataDir: string): Promise<number> {
  const pg = await openNodeFs(dataDir);
  try {
    const { rows } = await pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Rows"',
    );
    return rows[0].n;
  } finally {
    await closeNodeFs(pg, dataDir);
  }
}

async function dbState(dataDir: string): Promise<number> {
  const ctl = await fs.readFile(path.join(dataDir, "global", "pg_control"));
  return ctl.readUInt32LE(DB_STATE_OFFSET);
}

describe("convertSnapshotDir", () => {
  let templateDir: string;
  let root: string;
  let dir: string;
  let converting: string;
  let old: string;
  let snapshot: string;
  let deps: ConversionDeps;
  let info: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    templateDir = await fs.mkdtemp(path.join(os.tmpdir(), "convert-template-"));
    const pg = await openNodeFs(templateDir);
    await pg.exec('CREATE TABLE "Rows" (id int PRIMARY KEY, payload text)');
    await pg.exec(
      `INSERT INTO "Rows" SELECT g, repeat('x', 100) FROM generate_series(1, ${TEMPLATE_ROWS}) g`,
    );
    await closeNodeFs(pg, templateDir);
  });

  afterAll(async () => {
    await fs.rm(templateDir, RM);
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "convert-snapshot-"));
    dir = path.join(root, "reactor-storage");
    converting = `${dir}.converting`;
    old = `${dir}.old`;
    snapshot = path.join(dir, "snapshot.bin");
    const logger = childLogger(["convert-test"]);
    info = vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    deps = { openForVerify, logger };
  });

  afterEach(async () => {
    await fs.rm(root, RM);
  });

  /** snapshot.bin alone, or beside the loose tree it was migrated from. */
  async function makeSnapshotStore(options: { keepLoose?: boolean } = {}) {
    await fs.cp(templateDir, dir, { recursive: true });
    await writeSnapshotFromDir(dir, snapshot);
    if (options.keepLoose) return;
    for (const name of await fs.readdir(dir)) {
      if (name !== "snapshot.bin") await fs.rm(path.join(dir, name), RM);
    }
  }

  async function siblings(): Promise<{
    dir: boolean;
    snapshot: boolean;
    converting: boolean;
    old: boolean;
  }> {
    return {
      dir: await exists(dir),
      snapshot: await exists(snapshot),
      converting: await exists(converting),
      old: await exists(old),
    };
  }

  function crashAfter(step: ConversionStep): ConversionDeps {
    return {
      ...deps,
      afterStep: (s) => {
        if (s === step) throw new Error(`crash after ${step}`);
      },
    };
  }

  it("converts a snapshot, deletes the old dir, opens with no recovery", async () => {
    await makeSnapshotStore();
    const snapshotBytes = (await fs.stat(snapshot)).size;

    await recoverConversion(dir, deps);
    expect(await convertSnapshotDir(dir, deps)).toBe("converted");

    expect(await siblings()).toEqual({
      dir: true,
      snapshot: false,
      converting: false,
      old: false,
    });
    expect(await exists(path.join(dir, "postmaster.pid"))).toBe(false);
    expect(await dbState(dir)).toBe(DB_SHUTDOWNED);
    expect(await countRows(dir)).toBe(TEMPLATE_ROWS);

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain(dir);
    expect(line).toContain(`snapshot ${snapshotBytes} bytes`);
    expect(line).toMatch(/-> \d+ bytes on disk/);
    expect(line).toMatch(/ \d+ entries/);
    expect(line).toMatch(/ \d+ ms$/);
  });

  it("is a no-op on a converted dir and on a fresh install", async () => {
    await makeSnapshotStore();
    await convertSnapshotDir(dir, deps);
    expect(await convertSnapshotDir(dir, deps)).toBe("none");

    const fresh = path.join(root, "fresh");
    await recoverConversion(fresh, deps);
    expect(await convertSnapshotDir(fresh, deps)).toBe("none");
    expect(await exists(fresh)).toBe(false);
  });

  it("ignores stale loose files beside the snapshot", async () => {
    await makeSnapshotStore({ keepLoose: true });
    const pg = await openNodeFs(dir);
    await pg.exec('DELETE FROM "Rows" WHERE id > 100');
    await closeNodeFs(pg, dir);
    expect(await countRows(dir)).toBe(100);

    expect(await convertSnapshotDir(dir, deps)).toBe("converted");
    expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
  });

  it("leaves the original untouched when verification fails", async () => {
    await makeSnapshotStore({ keepLoose: true });
    const before = await fs.readFile(snapshot);
    const listing = (await fs.readdir(dir)).sort();

    const mismatching: ConversionDeps = {
      ...deps,
      openForVerify: async (major, dataDir) => {
        const handle = await openForVerify(major, dataDir);
        return {
          close: () => handle.close(),
          query: async <T>(sql: string) => {
            const result = await handle.query<T>(sql);
            if (!sql.includes("pg_control_system")) return result;
            const row = result.rows[0] as { system_identifier: string };
            const last = row.system_identifier.endsWith("0") ? "1" : "0";
            row.system_identifier = row.system_identifier.slice(0, -1) + last;
            return result;
          },
        };
      },
    };
    await expect(convertSnapshotDir(dir, mismatching)).rejects.toThrow(
      /system identifier mismatch/,
    );

    expect(await siblings()).toEqual({
      dir: true,
      snapshot: true,
      converting: false,
      old: false,
    });
    expect((await fs.readFile(snapshot)).equals(before)).toBe(true);
    expect((await fs.readdir(dir)).sort()).toEqual(listing);
    expect(info).not.toHaveBeenCalled();
  });

  it("leaves the original untouched when the major is unsupported", async () => {
    await fs.cp(templateDir, dir, { recursive: true });
    await fs.writeFile(path.join(dir, "PG_VERSION"), "16\n");
    await writeSnapshotFromDir(dir, snapshot);
    await expect(convertSnapshotDir(dir, deps)).rejects.toThrow(
      /unsupported PGlite major 16/,
    );
    expect(await siblings()).toEqual({
      dir: true,
      snapshot: true,
      converting: false,
      old: false,
    });
  });

  it("closes the verify handle before the swap", async () => {
    await makeSnapshotStore();
    const events: string[] = [];
    const observing: ConversionDeps = {
      ...deps,
      openForVerify: async (major, dataDir) => {
        const handle = await openForVerify(major, dataDir);
        return {
          query: (sql) => handle.query(sql),
          close: async () => {
            events.push(
              `close old=${await exists(old)} dir=${await exists(dir)} snapshot=${await exists(snapshot)}`,
            );
            await handle.close();
          },
        };
      },
      afterStep: (step) => {
        events.push(step);
      },
    };
    expect(await convertSnapshotDir(dir, observing)).toBe("converted");
    expect(events).toEqual([
      "extract",
      "close old=false dir=true snapshot=true",
      "verify",
      "renameOld",
      "renameNew",
      "removeOld",
    ]);
  });

  describe("recovery", () => {
    it("a failure after extract removes .converting and rethrows", async () => {
      await makeSnapshotStore();
      await expect(
        convertSnapshotDir(dir, crashAfter("extract")),
      ).rejects.toThrow(/crash after extract/);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: true,
        converting: false,
        old: false,
      });
      await recoverConversion(dir, deps);
      expect(await convertSnapshotDir(dir, deps)).toBe("converted");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("a failure after verify removes .converting and rethrows", async () => {
      await makeSnapshotStore();
      await expect(
        convertSnapshotDir(dir, crashAfter("verify")),
      ).rejects.toThrow(/crash after verify/);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: true,
        converting: false,
        old: false,
      });
      await recoverConversion(dir, deps);
      expect(await convertSnapshotDir(dir, deps)).toBe("converted");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("row 1: snapshot with a leftover .converting is cleaned and converted again", async () => {
      await makeSnapshotStore();
      await fs.mkdir(path.join(converting, "base"), { recursive: true });
      await fs.writeFile(path.join(converting, "PG_VERSION"), "junk");

      await recoverConversion(dir, deps);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: true,
        converting: false,
        old: false,
      });
      expect(await convertSnapshotDir(dir, deps)).toBe("converted");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("row 2: snapshot with a superseded .old removes .old and converts", async () => {
      await makeSnapshotStore();
      await fs.mkdir(old);
      await fs.writeFile(path.join(old, "PG_VERSION"), "17\n");

      await recoverConversion(dir, deps);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: true,
        converting: false,
        old: false,
      });
      expect(await convertSnapshotDir(dir, deps)).toBe("converted");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("row 3: died between the renames; the next boot finishes the swap", async () => {
      await makeSnapshotStore();
      await expect(
        convertSnapshotDir(dir, crashAfter("renameOld")),
      ).rejects.toThrow(/crash after renameOld/);
      expect(await siblings()).toEqual({
        dir: false,
        snapshot: false,
        converting: true,
        old: true,
      });

      await recoverConversion(dir, deps);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: false,
        converting: false,
        old: false,
      });
      expect(await convertSnapshotDir(dir, deps)).toBe("none");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("row 4: died before removing .old; the next boot removes it", async () => {
      await makeSnapshotStore();
      await expect(
        convertSnapshotDir(dir, crashAfter("renameNew")),
      ).rejects.toThrow(/crash after renameNew/);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: false,
        converting: false,
        old: true,
      });

      await recoverConversion(dir, deps);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: false,
        converting: false,
        old: false,
      });
      expect(await convertSnapshotDir(dir, deps)).toBe("none");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });

    it("a converted dir with a stray .converting keeps the dir and drops the stray", async () => {
      await fs.cp(templateDir, dir, { recursive: true });
      await fs.mkdir(converting);
      await fs.writeFile(path.join(converting, "PG_VERSION"), "junk");
      const listing = (await fs.readdir(dir)).sort();

      await recoverConversion(dir, deps);
      expect(await siblings()).toEqual({
        dir: true,
        snapshot: false,
        converting: false,
        old: false,
      });
      expect((await fs.readdir(dir)).sort()).toEqual(listing);
      expect(await convertSnapshotDir(dir, deps)).toBe("none");
    });

    it("row 5: refuses to initdb beside an orphaned sibling", async () => {
      await fs.mkdir(old);
      await fs.writeFile(path.join(old, "PG_VERSION"), "17\n");
      await expect(recoverConversion(dir, deps)).rejects.toThrow(
        /refusing to initialize/,
      );
      expect(await siblings()).toEqual({
        dir: false,
        snapshot: false,
        converting: false,
        old: true,
      });
    });

    it("row 6: a fresh install has nothing to recover", async () => {
      await recoverConversion(dir, deps);
      expect(await exists(dir)).toBe(false);
      expect(await exists(root)).toBe(true);
    });

    it("a failure after removeOld leaves a converted dir that needs nothing", async () => {
      await makeSnapshotStore();
      await expect(
        convertSnapshotDir(dir, crashAfter("removeOld")),
      ).rejects.toThrow(/crash after removeOld/);
      await recoverConversion(dir, deps);
      expect(await convertSnapshotDir(dir, deps)).toBe("none");
      expect(await countRows(dir)).toBe(TEMPLATE_ROWS);
    });
  });
});
