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

  it("exposes the top-level packageRegistryUrl read by the SPA Package Manager", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [
        { packageName: "@scope/pkg", version: "1.0.0", provider: "registry" },
      ],
      localPackage: null,
      packageRegistryUrl: "https://reg.example",
      connect: {},
    });
    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();
    expect(config.packageRegistryUrl).toBe("https://reg.example");
    expect(config.packages).toHaveLength(1);
    expect(config.packages[0].packageName).toBe("@scope/pkg");
  });

  it("removed PH_CONNECT_* env vars do NOT override the file values (scenario 34, runtime side)", async () => {
    // Hostile env: every PH_CONNECT_* key that used to drive the SPA's
    // runtime config is set to a sentinel that, if it leaked through any
    // code path, would be visible in the loaded config. None should.
    const HOSTILE = "ENV_SHOULD_NOT_LEAK";
    const originalEnv = { ...process.env };
    try {
      process.env.PH_CONNECT_LOG_LEVEL = HOSTILE;
      process.env.PH_CONNECT_BASE_PATH = HOSTILE;
      process.env.PH_CONNECT_RENOWN_URL = HOSTILE;
      process.env.PH_CONNECT_RENOWN_NETWORK_ID = HOSTILE;
      process.env.PH_CONNECT_RENOWN_CHAIN_ID = HOSTILE;
      process.env.PH_CONNECT_DEFAULT_DRIVES_URL = HOSTILE;
      process.env.PH_CONNECT_DRIVES_PRESERVE_STRATEGY = HOSTILE;
      process.env.PH_CONNECT_PUBLIC_DRIVES_ENABLED = HOSTILE;
      process.env.PH_CONNECT_LOCAL_DRIVES_ENABLED = HOSTILE;
      process.env.PH_CONNECT_DISABLE_ADD_DRIVE = HOSTILE;
      process.env.PH_CONNECT_EXTERNAL_PACKAGES_DISABLED = HOSTILE;
      process.env.PH_CONNECT_PACKAGES = HOSTILE;
      process.env.PH_CONNECT_PACKAGES_REGISTRY = HOSTILE;
      process.env.PH_DISABLE_LOCAL_PACKAGE = HOSTILE;

      // File payload is the ONLY source the SPA reads from.
      stubFetch({
        schemaVersion: 2,
        packages: [],
        localPackage: null,
        packageRegistryUrl: "https://reg.from-file",
        connect: {
          renown: { url: "https://renown.from-file" },
          app: { logLevel: "trace", basePath: "/from-file" },
        },
      });

      const { loadRuntimeConfig } = await import("../src/runtime-config.js");
      const config = await loadRuntimeConfig();

      expect(config.packageRegistryUrl).toBe("https://reg.from-file");
      expect(config.connect.renown?.url).toBe("https://renown.from-file");
      expect(config.connect.app?.logLevel).toBe("trace");
      expect(config.connect.app?.basePath).toBe("/from-file");

      // Stringify the entire loaded config and assert the hostile sentinel
      // is nowhere — catches env leaks at any nested path we didn't enumerate.
      expect(JSON.stringify(config)).not.toContain(HOSTILE);
    } finally {
      process.env = originalEnv;
    }
  });

  it("a fresh module evaluation (= browser hard-refresh) sees newly-written values (scenarios 30-33)", async () => {
    // First load — Connect reads the initial dist payload.
    stubFetch({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      packageRegistryUrl: "https://before.example",
      connect: { renown: { url: "https://before.renown" } },
    });
    const first = await import("../src/runtime-config.js");
    const before = await first.loadRuntimeConfig();
    expect(before.packageRegistryUrl).toBe("https://before.example");
    expect(before.connect.renown?.url).toBe("https://before.renown");

    // Equivalent of `ph connect config --renown-url …` writing to the dist
    // file, followed by the user hard-refreshing the page (browser tears
    // down + re-evaluates every module).
    vi.resetModules();
    stubFetch({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      packageRegistryUrl: "https://after.example",
      connect: {
        renown: { url: "https://after.renown" },
        app: { basePath: "/refreshed" },
      },
    });
    const second = await import("../src/runtime-config.js");
    const after = await second.loadRuntimeConfig();
    expect(after.packageRegistryUrl).toBe("https://after.example");
    expect(after.connect.renown?.url).toBe("https://after.renown");
    expect(after.connect.app?.basePath).toBe("/refreshed");
  });

  it("returns source values for connect.app and connect.drives when set in the file", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {
        app: { logLevel: "debug", basePath: "/sub" },
        drives: {
          defaultDrives: [
            { url: "https://drive.example", name: null, icon: null },
          ],
          preserveStrategy: "preserve-all",
        },
      },
    });
    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();
    expect(config.connect.app?.logLevel).toBe("debug");
    expect(config.connect.app?.basePath).toBe("/sub");
    expect(config.connect.drives?.defaultDrives).toEqual([
      { url: "https://drive.example", name: null, icon: null },
    ]);
    expect(config.connect.drives?.preserveStrategy).toBe("preserve-all");
  });
});
