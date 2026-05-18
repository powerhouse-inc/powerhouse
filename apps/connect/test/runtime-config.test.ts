import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubFetch(body: unknown) {
  // @ts-expect-error partial mock is fine for tests
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(body),
    }),
  );
}

describe("runtime-config loader", () => {
  beforeEach(() => {
    vi.resetModules();
    // The adapter branches on `typeof window`. Vitest runs under Node, so we
    // need to stub it for JsonConfigAdapter to take the fetch path.
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    // @ts-expect-error reset
    delete globalThis.fetch;
    vi.unstubAllGlobals();
  });

  it("loads a config with structured packages and merges user connect overrides on top of defaults", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [
        { packageName: "@scope/pkg-a", version: "1.0.0", provider: "registry" },
        { packageName: "@scope/pkg-b", provider: "registry" },
      ],
      localPackage: { name: "test-project", version: "0.1.0" },
      connect: {
        branding: { appName: "Test" },
        drives: { allowAddDrive: false },
      },
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();

    expect(config.schemaVersion).toBe(2);
    expect(config.packages).toHaveLength(2);
    expect(config.packages[0].packageName).toBe("@scope/pkg-a");
    expect(config.localPackage).toEqual({
      name: "test-project",
      version: "0.1.0",
    });
    // User overrides win
    expect(config.connect.branding?.appName).toBe("Test");
    expect(config.connect.drives?.allowAddDrive).toBe(false);
    // Untouched fields fall back to DEFAULT_CONNECT_CONFIG
    expect(config.connect.app?.logLevel).toBe(
      DEFAULT_CONNECT_CONFIG.app?.logLevel,
    );
    expect(config.connect.renown?.url).toBe(DEFAULT_CONNECT_CONFIG.renown?.url);
    expect(config.connect.drives?.sections?.remote?.enabled).toBe(true);
  });

  it("fills every connect.* leaf from DEFAULT_CONNECT_CONFIG when the file has no connect block", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();
    expect(config.connect).toEqual(DEFAULT_CONNECT_CONFIG);
  });

  it("tolerates unknown extra fields under connect (forward-compat)", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {
        branding: { appName: "Test" },
        futureField: { a: 1 },
        anotherFuture: "string",
      },
      unrelatedFuture: true,
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();
    expect(config.connect.branding?.appName).toBe("Test");
    expect(
      (config.connect as unknown as Record<string, unknown>).futureField,
    ).toEqual({ a: 1 });
  });

  it("caches the loaded config across calls (single fetch)", async () => {
    stubFetch({ schemaVersion: 2, packages: [], localPackage: null });
    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await loadRuntimeConfig();
    await loadRuntimeConfig();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("getRuntimeConfig throws before loadRuntimeConfig has resolved", async () => {
    stubFetch({ schemaVersion: 2, packages: [], localPackage: null });
    const { getRuntimeConfig } = await import("../src/runtime-config.js");
    expect(() => getRuntimeConfig()).toThrow(/cache empty/);
  });
});
