import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigLoader,
  deepMerge,
  type ConfigAdapter,
  type ConfigShape,
} from "./config-loader.js";
import { JsonConfigAdapter } from "./json-adapter.js";
import { DEFAULT_CONNECT_CONFIG } from "./runtime-config.js";

class InMemoryAdapter implements ConfigAdapter {
  readonly source = "memory:test";
  reads = 0;
  writes: ConfigShape[] = [];
  constructor(public value: unknown) {}
  read(): Promise<unknown> {
    this.reads += 1;
    return Promise.resolve(this.value);
  }
  write(next: ConfigShape): Promise<void> {
    this.writes.push(next);
    this.value = next;
    return Promise.resolve();
  }
}

describe("deepMerge", () => {
  it("recursively merges nested objects", () => {
    const base = { a: { b: { c: 1, d: 2 } }, e: 3 };
    const patch = { a: { b: { d: 99 } } };
    expect(deepMerge(base, patch)).toEqual({ a: { b: { c: 1, d: 99 } }, e: 3 });
  });

  it("replaces arrays wholesale (does not append)", () => {
    const base = { list: [1, 2, 3] };
    const patch = { list: [9] };
    expect(deepMerge(base, patch)).toEqual({ list: [9] });
  });

  it("treats undefined in patch as 'leave alone'", () => {
    const base = { keep: "yes", clear: "no" };
    const patch = { clear: undefined };
    expect(deepMerge(base, patch)).toEqual({ keep: "yes", clear: "no" });
  });

  it("treats null in patch as an explicit set", () => {
    type Base = { branding: { homeBackground: { avif: string } | null } };
    const base: Base = { branding: { homeBackground: { avif: "/a" } } };
    const patch = { branding: { homeBackground: null } };
    expect(deepMerge(base, patch)).toEqual({
      branding: { homeBackground: null },
    });
  });
});

describe("ConfigLoader", () => {
  it("fills in DEFAULT_CONNECT_CONFIG when the file has an empty connect block", async () => {
    const adapter = new InMemoryAdapter({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {},
    });
    const loader = new ConfigLoader(adapter);
    const result = await loader.read();
    // Every default field is populated
    expect(result.connect.branding?.appName).toBe(
      DEFAULT_CONNECT_CONFIG.branding?.appName,
    );
    expect(result.connect.app?.logLevel).toBe("info");
    expect(result.connect.renown?.url).toBe("https://www.renown.id");
    expect(result.connect.drives?.sections?.remote?.enabled).toBe(true);
  });

  it("user overrides win over defaults, unspecified fields fall back", async () => {
    const adapter = new InMemoryAdapter({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {
        branding: { appName: "My Connect" },
        drives: { allowAddDrive: false },
      },
    });
    const loader = new ConfigLoader(adapter);
    const result = await loader.read();
    expect(result.connect.branding?.appName).toBe("My Connect");
    expect(result.connect.drives?.allowAddDrive).toBe(false);
    // Untouched fields keep defaults
    expect(result.connect.app?.logLevel).toBe("info");
    expect(result.connect.renown?.networkId).toBe("eip155");
    expect(result.connect.drives?.defaultDrives).toEqual([]);
    expect(result.connect.drives?.sections?.local?.enabled).toBe(true);
  });

  it("passes through top-level fields outside `connect` (source-config compatibility)", async () => {
    const adapter = new InMemoryAdapter({
      documentModelsDir: "./document-models",
      studio: { port: 3002 },
      reactor: { port: 4001 },
      connect: {},
    });
    const loader = new ConfigLoader(adapter);
    const result = await loader.read();
    expect(result.documentModelsDir).toBe("./document-models");
    expect(result.studio).toEqual({ port: 3002 });
    expect(result.reactor).toEqual({ port: 4001 });
    // Connect block still gets defaults applied
    expect(result.connect.branding?.appName).toBe("Powerhouse Connect");
  });

  it("returns a fully-defaulted connect when the file is empty / missing connect", async () => {
    const adapter = new InMemoryAdapter({});
    const loader = new ConfigLoader(adapter);
    const result = await loader.read();
    expect(result.connect).toEqual(DEFAULT_CONNECT_CONFIG);
  });

  it("returns a fully-defaulted connect when the raw payload is non-object junk", async () => {
    const adapter = new InMemoryAdapter("not an object");
    const loader = new ConfigLoader(adapter);
    const result = await loader.read();
    expect(result.connect).toEqual(DEFAULT_CONNECT_CONFIG);
  });

  it("caches the result of read across calls", async () => {
    const adapter = new InMemoryAdapter({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {},
    });
    const loader = new ConfigLoader(adapter);
    await loader.read();
    await loader.read();
    expect(adapter.reads).toBe(1);
  });

  it("getCached throws before read resolves", () => {
    const adapter = new InMemoryAdapter({ connect: {} });
    const loader = new ConfigLoader(adapter);
    expect(() => loader.getCached()).toThrow(/cache empty/);
  });

  it("invalidate forces a re-read", async () => {
    const adapter = new InMemoryAdapter({ connect: {} });
    const loader = new ConfigLoader(adapter);
    await loader.read();
    loader.invalidate();
    await loader.read();
    expect(adapter.reads).toBe(2);
  });

  it("write deep-merges patch into current and persists", async () => {
    const adapter = new InMemoryAdapter({
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: { branding: { appName: "Old" } },
    });
    const loader = new ConfigLoader(adapter);
    const next = await loader.write({
      connect: { branding: { appName: "New" } },
    });
    expect(next.connect.branding?.appName).toBe("New");
    expect(adapter.writes).toHaveLength(1);
    expect(loader.getCached().connect.branding?.appName).toBe("New");
  });

  it("write preserves unrelated fields (top-level + other connect siblings)", async () => {
    const initial = {
      documentModelsDir: "./document-models",
      studio: { port: 3002 },
      packages: [{ packageName: "@scope/pkg", version: "1.0.0" }],
      connect: {
        branding: { appName: "Keep" },
        drives: { allowAddDrive: false },
      },
    };
    const adapter = new InMemoryAdapter(initial);
    const loader = new ConfigLoader(adapter);
    await loader.write({ connect: { app: { logLevel: "debug" } } });
    const written = adapter.writes[0];
    // Top-level passthrough
    expect(written.documentModelsDir).toBe("./document-models");
    expect(written.studio).toEqual({ port: 3002 });
    expect(written.packages).toEqual(initial.packages);
    // Connect siblings preserved
    expect(written.connect.branding?.appName).toBe("Keep");
    expect(written.connect.drives?.allowAddDrive).toBe(false);
    // Patch applied
    expect(written.connect.app?.logLevel).toBe("debug");
    // Untouched defaults still present
    expect(written.connect.renown?.url).toBe("https://www.renown.id");
  });

  it("accepts a custom defaults object for tests / specialised consumers", async () => {
    const adapter = new InMemoryAdapter({ connect: {} });
    const customDefaults = {
      ...DEFAULT_CONNECT_CONFIG,
      branding: { appName: "Custom Default" },
    };
    const loader = new ConfigLoader(adapter, customDefaults);
    const result = await loader.read();
    expect(result.connect.branding?.appName).toBe("Custom Default");
  });
});

describe("JsonConfigAdapter (Node side, filesystem read+write)", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "json-adapter-test-"));
    path = join(dir, "powerhouse.config.json");
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 2,
        packages: [],
        localPackage: { name: "test-project", version: "1.0.0" },
        connect: { branding: { appName: "Initial" } },
      }),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a full config through a real file", async () => {
    const loader = new ConfigLoader(new JsonConfigAdapter({ path }));
    const initial = await loader.read();
    expect(initial.localPackage).toEqual({
      name: "test-project",
      version: "1.0.0",
    });
    expect(initial.connect.branding?.appName).toBe("Initial");

    await loader.write({ connect: { app: { logLevel: "debug" } } });

    // Fresh loader against the same file should see the write
    const fresh = await new ConfigLoader(
      new JsonConfigAdapter({ path }),
    ).read();
    expect(fresh.connect.app?.logLevel).toBe("debug");
    expect(fresh.connect.branding?.appName).toBe("Initial");

    // File ends with a trailing newline + 2-space indent
    const raw = readFileSync(path, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("source string includes the resolved path for error messages", () => {
    expect(new JsonConfigAdapter({ path }).source).toBe(`json:${path}`);
  });

  it("defaults to relative 'powerhouse.config.json'", () => {
    expect(new JsonConfigAdapter().source).toBe("json:powerhouse.config.json");
  });
});

describe("JsonConfigAdapter (browser side, fetch read)", () => {
  // Vitest runs under Node, so `window` is undefined by default. Stub it so
  // the adapter takes the browser code path.
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses fetch when `window` is defined", async () => {
    const payload = {
      schemaVersion: 2,
      packages: [],
      localPackage: null,
      connect: {},
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new JsonConfigAdapter({
      path: "/connect/powerhouse.config.json",
    });
    const result = await adapter.read();
    expect(fetchMock).toHaveBeenCalledWith("/connect/powerhouse.config.json");
    expect(result).toEqual(payload);
  });

  it("read throws on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }),
    );
    await expect(new JsonConfigAdapter().read()).rejects.toThrow(
      /failed to fetch.*404 Not Found/,
    );
  });
});
