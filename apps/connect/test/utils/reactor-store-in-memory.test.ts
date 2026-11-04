import { describe, expect, it, vi } from "vitest";
import { IN_MEMORY_PGLITE_STORAGE_FACTS } from "@powerhousedao/reactor";
import {
  getDb,
  getReactorPGlite,
  REACTOR_STORAGE_FACTS,
} from "../../src/pglite.db.js";
import { readPgVersionFile } from "../../src/utils/pglite-idb.js";
import type { loadPGliteModule } from "../../src/utils/pglite-major.js";
import {
  detectMigrationMajor,
  detectReactorPgMajor,
} from "../../src/utils/pglite-runtime.js";

class FakePGlite {
  constructor(readonly dataDir: string) {}
  close(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("../../src/utils/pglite-idb.js", () => ({
  readPgVersionFile: vi.fn(() => Promise.resolve(16)),
}));

vi.mock(import("../../src/utils/pglite-major.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  loadPGliteModule: () =>
    Promise.resolve({ PGlite: FakePGlite } as unknown as Awaited<
      ReturnType<typeof loadPGliteModule>
    >),
}));

vi.mock("@electric-sql/pglite/live", () => ({ live: {} }));

vi.mock("../../src/utils/storage-namespace.js", () => ({
  REACTOR_PGLITE_NAME: "test-reactor",
  REACTOR_STORE_IN_MEMORY: true,
  RELATIONAL_PGLITE_NAME: "test-relational",
  REACTOR_IDB_NAME: "/pglite/test-reactor",
  RELATIONAL_IDB_NAME: "/pglite/test-relational",
}));

describe("an in-memory Connect store", () => {
  it("opens both stores in memory at the current major, reading no IndexedDB", async () => {
    const reactor = (await getReactorPGlite()) as unknown as FakePGlite;
    const { pgLite } = await getDb();
    expect(reactor.dataDir).toBe("memory://");
    expect((pgLite as unknown as FakePGlite).dataDir).toBe("memory://");
    await expect(detectReactorPgMajor()).resolves.toBeNull();
    await expect(detectMigrationMajor()).resolves.toBeNull();
    expect(readPgVersionFile).not.toHaveBeenCalled();
    expect(REACTOR_STORAGE_FACTS).toBe(IN_MEMORY_PGLITE_STORAGE_FACTS);
  });
});
