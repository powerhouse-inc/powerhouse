import { createDurableNodeFs } from "@powerhousedao/reactor-api/pglite-node";
import type { ILogger } from "document-model";
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
import { runPglitePreflight } from "../src/pglite-preflight.js";
import { loadNodeFsClass, loadPGliteModule } from "../src/pglite-version.js";
import { writeSnapshotFromDir } from "./snapshot-writer.js";

// PGlite initdb and pg_dump are several times slower on the Windows runner.
const BOOT_TIMEOUT = 120_000;
const RM = { recursive: true, force: true, maxRetries: 10 } as const;
const ROWS = 10;
const CONVERTED_LINE =
  /^Converted PGlite snapshot at (.+): snapshot (\d+) bytes -> (\d+) bytes on disk, (\d+) entries, (\d+) ms$/;

type StubLogger = ILogger & {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

function stubLogger(): StubLogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as StubLogger;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function pgVersion(dir: string): Promise<string> {
  return (await fs.readFile(path.join(dir, "PG_VERSION"), "utf8")).trim();
}

/** Opens `dir` the way the server does and counts the seeded rows. */
async function countRows(dir: string, major: 16 | 17): Promise<number> {
  const [{ PGlite: Pg }, Base] = await Promise.all([
    loadPGliteModule(major),
    loadNodeFsClass(major),
  ]);
  const pg = new Pg({
    fs: createDurableNodeFs(Base, dir, {
      fsync: false,
      maintenanceIntervalMs: 0,
    }),
  });
  try {
    await pg.waitReady;
    const { rows } = await pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Rows"',
    );
    return rows[0].n;
  } finally {
    await pg.close();
  }
}

function convertedLines(logger: StubLogger): string[] {
  return logger.info.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => CONVERTED_LINE.test(line));
}

describe("runPglitePreflight", () => {
  // A pure-snapshot PG16 store: snapshot.bin and nothing else, the layout
  // AtomicNodeFs left for a store it created itself.
  let template: string;
  let root: string;
  let logger: StubLogger;

  beforeAll(async () => {
    template = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-template-"));
    const loose = path.join(template, "loose");
    const { PGlite: LegacyPGlite } = await loadPGliteModule(16);
    const LegacyNodeFS = await loadNodeFsClass(16);
    const pg = new LegacyPGlite({ fs: new LegacyNodeFS(loose) });
    await pg.waitReady;
    await pg.exec('CREATE TABLE "Rows" (id int PRIMARY KEY, payload text)');
    await pg.exec(
      `INSERT INTO "Rows" SELECT g, repeat('x', 100) FROM generate_series(1, ${ROWS}) g`,
    );
    await pg.close();
    await fs.rm(path.join(loose, "postmaster.pid"), { force: true });
    expect(await pgVersion(loose)).toBe("16");

    const store = path.join(template, "store");
    await fs.mkdir(store);
    await writeSnapshotFromDir(loose, path.join(store, "snapshot.bin"));
    await fs.rm(loose, RM);
  }, BOOT_TIMEOUT);

  afterAll(async () => {
    await fs.rm(template, RM);
  }, BOOT_TIMEOUT);

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "preflight-"));
    logger = stubLogger();
  });

  afterEach(async () => {
    await fs.rm(root, RM);
  }, BOOT_TIMEOUT);

  async function snapshotDir(name: string): Promise<string> {
    const dir = path.join(root, name);
    await fs.cp(path.join(template, "store"), dir, { recursive: true });
    return dir;
  }

  async function looseDir(name: string, major = 17): Promise<string> {
    const dir = path.join(root, name);
    await fs.mkdir(path.join(dir, "pg_wal"), { recursive: true });
    await fs.writeFile(path.join(dir, "PG_VERSION"), `${major}\n`);
    return dir;
  }

  it(
    "converts before detecting the major, so a PG16 snapshot is migrated",
    async () => {
      const dir = await snapshotDir("reactor-storage");

      const detected = await runPglitePreflight({
        dirs: [dir],
        migratePglite: true,
        inMemory: false,
        logger,
      });

      expect(detected.get(dir)).toBe(17);
      expect(await pgVersion(dir)).toBe("17");
      expect(await exists(path.join(dir, "snapshot.bin"))).toBe(false);
      expect(await exists(`${dir}.converting`)).toBe(false);
      expect(await exists(`${dir}.old`)).toBe(false);
      expect(convertedLines(logger)).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Migrating"),
      );
      expect(await countRows(dir, 17)).toBe(ROWS);
    },
    BOOT_TIMEOUT,
  );

  // Pins the order alone: before this change a pure-snapshot dir had no loose
  // PG_VERSION and the migration logged "No PG_VERSION; skipping". The case
  // above also needs the legacy pg_dump to work.
  it(
    "attempts the migration of a PG16 snapshot instead of skipping it",
    async () => {
      const dir = await snapshotDir("reactor-storage");

      await runPglitePreflight({
        dirs: [dir],
        migratePglite: true,
        inMemory: false,
        logger,
      }).catch(() => undefined);

      expect(convertedLines(logger)).toHaveLength(1);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("No PG_VERSION"),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Migrating ${dir} from PG16 to PG17`),
      );
    },
    BOOT_TIMEOUT,
  );

  it(
    "boots a converted dir on the second start without converting",
    async () => {
      const dir = await snapshotDir("reactor-storage");
      const first = { dirs: [dir], inMemory: false, logger };
      await runPglitePreflight(first);
      expect(convertedLines(logger)).toHaveLength(1);
      expect(await pgVersion(dir)).toBe("16");

      const second = stubLogger();
      const detected = await runPglitePreflight({ ...first, logger: second });

      expect(detected.get(dir)).toBe(16);
      expect(convertedLines(second)).toHaveLength(0);
      expect(await exists(`${dir}.converting`)).toBe(false);
      expect(await exists(`${dir}.old`)).toBe(false);
      expect(await countRows(dir, 16)).toBe(ROWS);
    },
    BOOT_TIMEOUT,
  );

  it("removes pg_wal/xlogtemp.*", async () => {
    const dir = await looseDir("read-storage");
    const segment = path.join(dir, "pg_wal", "000000010000000000000001");
    await fs.writeFile(segment, "wal");
    await fs.writeFile(path.join(dir, "pg_wal", "xlogtemp.42"), "");
    await fs.writeFile(path.join(dir, "pg_wal", "xlogtemp.7"), "");

    const detected = await runPglitePreflight({
      dirs: [dir],
      inMemory: false,
      logger,
    });

    expect(detected.get(dir)).toBe(17);
    expect(await fs.readdir(path.join(dir, "pg_wal"))).toEqual([
      "000000010000000000000001",
    ]);
    expect(await exists(segment)).toBe(true);
  });

  it("removes postmaster.pid without a warn call", async () => {
    const dir = await looseDir("read-storage");
    const lockfile = path.join(dir, "postmaster.pid");
    await fs.writeFile(lockfile, "42\n");

    await runPglitePreflight({ dirs: [dir], inMemory: false, logger });

    expect(await exists(lockfile)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(lockfile),
    );
  });

  it(
    "logs one info line per converted dir with sizes and duration",
    async () => {
      const reactor = await snapshotDir("reactor-storage");
      const readModel = await snapshotDir("read-storage");

      await runPglitePreflight({
        dirs: [reactor, readModel],
        inMemory: false,
        logger,
      });

      const lines = convertedLines(logger);
      expect(lines).toHaveLength(2);
      const byDir = new Map(
        lines.map((line) => {
          const match = CONVERTED_LINE.exec(line)!;
          return [match[1], match.slice(2).map(Number)] as const;
        }),
      );
      for (const dir of [reactor, readModel]) {
        const [snapshotBytes, convertedBytes, entries] = byDir.get(dir)!;
        expect(snapshotBytes).toBeGreaterThan(0);
        expect(convertedBytes).toBeGreaterThan(0);
        expect(entries).toBeGreaterThan(0);
      }
    },
    BOOT_TIMEOUT,
  );

  it("touches nothing in memory", async () => {
    const dir = await snapshotDir("reactor-storage");

    const detected = await runPglitePreflight({
      dirs: [dir],
      inMemory: true,
      logger,
    });

    expect(detected.size).toBe(0);
    expect(await exists(path.join(dir, "snapshot.bin"))).toBe(true);
  });

  it("wipes the dirs and their conversion siblings under forcePgVersion", async () => {
    const dir = await snapshotDir("reactor-storage");
    await fs.mkdir(`${dir}.old`);
    await fs.mkdir(`${dir}.converting`);

    const detected = await runPglitePreflight({
      dirs: [dir],
      forcePgVersion: 17,
      migratePglite: true,
      inMemory: false,
      logger,
    });

    expect(detected.size).toBe(0);
    expect(await exists(dir)).toBe(false);
    expect(await exists(`${dir}.old`)).toBe(false);
    expect(await exists(`${dir}.converting`)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("ignoring --migrate-pglite"),
    );
  });
});
