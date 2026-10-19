import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePgliteStorageDirs } from "../src/server.mjs";

/** The classic layout, and the one-dir report (uniform-runners legacy parity). */
describe("resolvePgliteStorageDirs", () => {
  const phDir = path.join("/proj", ".ph");

  it("keeps the classic literals verbatim without a user-data root", () => {
    const saved = process.env.PH_USER_DATA_DIR;
    delete process.env.PH_USER_DATA_DIR;
    try {
      const dirs = resolvePgliteStorageDirs({
        dbPath: undefined,
        reactorDbUrl: undefined,
        callerReactor: false,
      });
      expect(dirs.reactorPgliteDir).toBe("./.ph/reactor-storage");
      expect(dirs.readModelPgliteDir).toBe(".ph/read-storage");
      expect(dirs.sharedPgliteDir).toBeNull();
    } finally {
      if (saved !== undefined) process.env.PH_USER_DATA_DIR = saved;
    }
  });

  it("defaults to the classic split under the .ph tree", () => {
    const dirs = resolvePgliteStorageDirs({
      dbPath: undefined,
      reactorDbUrl: undefined,
      callerReactor: false,
      phDir,
    });
    expect(dirs.reactorPgliteDir).toBe(path.join(phDir, "reactor-storage"));
    expect(dirs.readModelPgliteDir).toBe(path.join(phDir, "read-storage"));
    expect(dirs.pgliteDirs).toEqual([
      path.join(phDir, "reactor-storage"),
      path.join(phDir, "read-storage"),
    ]);
  });

  it("reports — but keeps — the classic dbPath-only layout: both stores in one dir", () => {
    const store = path.join("/proj", ".ph", "read-model.db");
    const dirs = resolvePgliteStorageDirs({
      dbPath: store,
      reactorDbUrl: store,
      callerReactor: false,
      phDir,
    });
    expect(dirs.reactorPgliteDir).toBe(store);
    expect(dirs.readModelPgliteDir).toBe(store);
    // pre-flight list unchanged from the classic code (not deduplicated)
    expect(dirs.pgliteDirs).toEqual([store, store]);
    expect(dirs.sharedPgliteDir).toBe(path.resolve(store));
  });

  it("detects the same dir spelled differently", () => {
    const dirs = resolvePgliteStorageDirs({
      dbPath: "/proj/.ph/store/",
      reactorDbUrl: "/proj/.ph/../.ph/store",
      callerReactor: false,
      phDir,
    });
    expect(dirs.sharedPgliteDir).toBe(path.resolve("/proj/.ph/store"));
  });

  it("allows one Postgres database for both stores", () => {
    const dirs = resolvePgliteStorageDirs({
      dbPath: "postgres://db/ph",
      reactorDbUrl: "postgres://db/ph",
      callerReactor: false,
      phDir,
    });
    expect(dirs.reactorPgliteDir).toBeNull();
    expect(dirs.readModelPgliteDir).toBeNull();
    expect(dirs.pgliteDirs).toEqual([]);
    expect(dirs.sharedPgliteDir).toBeNull();
  });

  it("allows dbPath to name the read model only when the caller owns the reactor", () => {
    const store = path.join("/proj", ".ph", "read-model.db");
    const dirs = resolvePgliteStorageDirs({
      dbPath: store,
      reactorDbUrl: store,
      callerReactor: true,
      phDir,
    });
    expect(dirs.reactorPgliteDir).toBeNull();
    expect(dirs.readModelPgliteDir).toBe(store);
    expect(dirs.pgliteDirs).toEqual([store]);
    expect(dirs.sharedPgliteDir).toBeNull();
  });

  it("keeps a distinct reactor dir from PH_REACTOR_DATABASE_URL beside a dbPath", () => {
    const dirs = resolvePgliteStorageDirs({
      dbPath: path.join(phDir, "read-storage"),
      reactorDbUrl: path.join(phDir, "reactor-storage"),
      callerReactor: false,
      phDir,
    });
    expect(dirs.pgliteDirs).toHaveLength(2);
    expect(dirs.sharedPgliteDir).toBeNull();
  });
});
