import { afterEach, describe, expect, it, vi } from "vitest";
import { discardReactorPGlite, getReactorPGlite } from "../../src/pglite.db.js";

class HungPGlite {
  static opened = 0;
  constructor() {
    HungPGlite.opened += 1;
  }
  close(): Promise<void> {
    return new Promise(() => undefined);
  }
}

vi.mock("../../src/utils/pglite-runtime.js", () => ({
  detectReactorPgMajor: () => Promise.resolve(17),
  detectRelationalPgMajor: () => Promise.resolve(17),
  resolvePgMajorForRuntime: () => 17,
  loadPGliteModule: () => Promise.resolve({ PGlite: HungPGlite }),
}));

vi.mock("@electric-sql/pglite/live", () => ({ live: {} }));

vi.mock("../../src/utils/storage-namespace.js", () => ({
  REACTOR_PGLITE_NAME: "test-reactor",
  RELATIONAL_PGLITE_NAME: "test-relational",
}));

describe("the in-tab reactor store when its close does not settle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("never opens a second instance in the same page", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await getReactorPGlite();
    expect(HungPGlite.opened).toBe(1);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const discarding = discardReactorPGlite();
    const queued = getReactorPGlite();
    queued.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(30_000);
    await discarding;
    vi.useRealTimers();

    await expect(queued).rejects.toThrow(/reload/);
    await expect(getReactorPGlite()).rejects.toThrow(/reload/);
    expect(HungPGlite.opened).toBe(1);
  });
});
