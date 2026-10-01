import { PGlite } from "@electric-sql/pglite";
import { NodeFS } from "@electric-sql/pglite/nodefs";
import { childLogger, type ILogger } from "document-model";
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
import type { ConversionDeps } from "../../src/pglite/convert-snapshot-dir.js";
import {
  CURRENT_PGLITE_MAJOR,
  openCurrentPgliteForVerify,
  preparePgliteDataDir,
} from "../../src/pglite/preflight.js";
import { writeSnapshotFromDir } from "./snapshot-writer.js";

const ROWS = 200;
const RM = { recursive: true, force: true, maxRetries: 10 } as const;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function countRows(dataDir: string): Promise<number> {
  const pg = new PGlite({ fs: new NodeFS(dataDir) });
  await pg.waitReady;
  try {
    const { rows } = await pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Rows"',
    );
    return rows[0].n;
  } finally {
    await pg.close();
  }
}

describe("preparePgliteDataDir", () => {
  let templateDir: string;
  let root: string;
  let dir: string;
  let logger: ILogger;
  let warn: ReturnType<typeof vi.fn>;
  let deps: ConversionDeps;

  beforeAll(async () => {
    templateDir = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-tpl-"));
    const pg = new PGlite({ fs: new NodeFS(templateDir) });
    await pg.waitReady;
    await pg.exec('CREATE TABLE "Rows" (id int PRIMARY KEY)');
    await pg.exec(`INSERT INTO "Rows" SELECT generate_series(1, ${ROWS})`);
    await pg.close();
  });

  afterAll(async () => {
    await fs.rm(templateDir, RM);
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-"));
    dir = path.join(root, "read-storage");
    logger = childLogger(["preflight-test"]);
    warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "debug").mockImplementation(() => {});
    deps = { openForVerify: openCurrentPgliteForVerify, logger };
  });

  afterEach(async () => {
    await fs.rm(root, RM);
  });

  it("converts a snapshot dir before opening", async () => {
    await fs.mkdir(dir);
    await writeSnapshotFromDir(templateDir, path.join(dir, "snapshot.bin"));

    await preparePgliteDataDir(dir, deps);

    expect(await exists(path.join(dir, "snapshot.bin"))).toBe(false);
    expect(await exists(`${dir}.converting`)).toBe(false);
    expect(await exists(`${dir}.old`)).toBe(false);
    expect(await countRows(dir)).toBe(ROWS);
  });

  it("removes postmaster.pid and pg_wal/xlogtemp.* without warning", async () => {
    await fs.cp(templateDir, dir, { recursive: true });
    const lockfile = path.join(dir, "postmaster.pid");
    const xlogtemp = path.join(dir, "pg_wal", "xlogtemp.42");
    await fs.writeFile(lockfile, "42\n");
    await fs.writeFile(xlogtemp, "");

    await preparePgliteDataDir(dir, deps);

    expect(await exists(lockfile)).toBe(false);
    expect(await exists(xlogtemp)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(await countRows(dir)).toBe(ROWS);
  });

  it("no-op on a plain PGDATA dir", async () => {
    await fs.cp(templateDir, dir, { recursive: true });
    await fs.rm(path.join(dir, "postmaster.pid"), { force: true });
    const before = (await fs.readdir(dir)).sort();

    await preparePgliteDataDir(dir, deps);

    expect((await fs.readdir(dir)).sort()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
    const pgVersion = await fs.readFile(path.join(dir, "PG_VERSION"), "utf8");
    expect(Number.parseInt(pgVersion, 10)).toBe(CURRENT_PGLITE_MAJOR);
  });

  it("does nothing for a missing dir", async () => {
    await preparePgliteDataDir(dir, deps);
    expect(await exists(dir)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses a snapshot of another major", async () => {
    await expect(
      openCurrentPgliteForVerify(CURRENT_PGLITE_MAJOR - 1, dir),
    ).rejects.toThrow(/PG16/);
  });
});
