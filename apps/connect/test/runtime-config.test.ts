import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubFetch(body: unknown) {
  // @ts-expect-error fetch type mismatch on a partial mock is fine for tests
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve(body),
    }),
  );
}

describe("runtime-config loader", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // @ts-expect-error reset
    delete globalThis.fetch;
  });

  it("tolerates unknown extra fields (forward-compat for Phase 2)", async () => {
    // Guards the contract that the loader must not reject future fields like
    // `connect:`. If someone tightens validation, this test fails loudly.
    stubFetch({
      schemaVersion: 1,
      packages: [],
      localPackage: null,
      futureField: { a: 1 },
      anotherFuture: "string",
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
  });

  it("warns on unrecognised schemaVersion but does not throw", async () => {
    // Documented design decision (CONNECT-CONFIG.md §4.5): warn don't throw on
    // schema mismatch, so a Phase 2 file landing in front of a Phase 1 SPA
    // (or vice versa) doesn't crash the boot path.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch({ schemaVersion: 99, packages: [], localPackage: null });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();

    expect(config.packages).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/schemaVersion/);

    warn.mockRestore();
  });
});
