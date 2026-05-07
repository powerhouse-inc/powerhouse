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

  it("loads a valid schemaVersion 2 config with structured packages", async () => {
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
    expect(config.packages[0].version).toBe("1.0.0");
    expect(config.localPackage).toEqual({
      name: "test-project",
      version: "0.1.0",
    });
    expect(config.connect?.branding?.appName).toBe("Test");
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
    await expect(loadRuntimeConfig()).resolves.toBeDefined();
  });

  it("rejects schemaVersion 1 with a clear error", async () => {
    stubFetch({
      schemaVersion: 1,
      packages: ["@scope/pkg-a@1.0.0"],
      localPackage: { name: "test", version: "0.1.0" },
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await expect(loadRuntimeConfig()).rejects.toThrow(
      /unsupported schemaVersion 1/,
    );
  });

  it("rejects unrecognised schemaVersion with a clear error", async () => {
    stubFetch({ schemaVersion: 99, packages: [], localPackage: null });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await expect(loadRuntimeConfig()).rejects.toThrow(
      /unsupported schemaVersion 99/,
    );
  });

  it("rejects packages as strings (old shape)", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: ["@scope/pkg-a@1.0.0"],
      localPackage: null,
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await expect(loadRuntimeConfig()).rejects.toThrow(/must be an object/);
  });

  it("rejects packages entry without packageName", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [{ name: "@scope/pkg-a" }],
      localPackage: null,
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    await expect(loadRuntimeConfig()).rejects.toThrow(
      /must have a 'packageName' string/,
    );
  });

  it("accepts packages without version or provider", async () => {
    stubFetch({
      schemaVersion: 2,
      packages: [{ packageName: "@scope/pkg-a" }],
      localPackage: null,
    });

    const { loadRuntimeConfig } = await import("../src/runtime-config.js");
    const config = await loadRuntimeConfig();
    expect(config.packages).toEqual([{ packageName: "@scope/pkg-a" }]);
  });
});
