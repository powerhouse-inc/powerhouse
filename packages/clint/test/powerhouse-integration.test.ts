import { describe, it, expect, vi, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { z } from "zod";
import { connectServiceDefinition } from "../src/integrations/powerhouse/connect.js";
import { bridgeSubscriptions } from "../src/integrations/powerhouse/subscriptions.js";
import {
  ensureDrive,
  ensureRemoteDrive,
} from "../src/integrations/powerhouse/drive.js";
import { deterministicId } from "../src/integrations/powerhouse/identity.js";
import { buildDefaultReactor } from "../src/integrations/powerhouse/index.js";
import { buildReactor } from "../src/integrations/powerhouse/reactor.js";
import {
  startSwitchboard,
  buildSwitchboardInstance,
} from "../src/integrations/powerhouse/switchboard.js";
import { defineRegistry } from "../src/integrations/powerhouse/registry.js";
import { defineCli, defineCommand, isPortFree } from "../src/index.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import type {
  ReactorContext,
  ReactorClientModule,
  SwitchboardInstance,
} from "../src/integrations/powerhouse/types.js";

describe("connectServiceDefinition", () => {
  it("creates a service definition with correct id and name", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    expect(svc.id).toBe("test-connect");
    expect(svc.name).toBe("test-connect");
    expect(svc.description).toBe("Powerhouse Connect web interface");
  });

  it("generates command string with port (no --default-drives-url flag)", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3001,
      name: "test-connect",
    });
    const cmd =
      typeof svc.command === "function"
        ? svc.command({
            config: {},
            proxy: { basePath: "" },
            params: { port: 3001, driveUrl: "http://localhost:4001/d/abc" },
          })
        : svc.command;
    expect(cmd).toContain("--port 3001");
    expect(cmd).not.toContain("--default-drives-url");
  });

  it("uses stamped port when no params override", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 4500,
      name: "my-connect",
    });
    const cmd =
      typeof svc.command === "function"
        ? svc.command({
            config: {},
            proxy: { basePath: "" },
            params: { driveUrl: "http://test" },
          })
        : svc.command;
    expect(cmd).toContain("--port 4500");
  });

  it("sets env vars for Connect", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    const env = svc.env?.({
      config: {},
      proxy: { basePath: "" },
      params: { driveUrl: "http://localhost:4001/d/abc" },
    });
    expect(env).toEqual({
      PH_CONNECT_DEFAULT_DRIVES_URL: "http://localhost:4001/d/abc",
      PH_CONNECT_DRIVES_PRESERVE_STRATEGY: "preserve-all",
    });
  });

  it("omits PH_CONNECT_PACKAGES_REGISTRY when registryUrl is not set", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    const env =
      svc.env?.({
        config: {},
        proxy: { basePath: "" },
        params: { driveUrl: "http://localhost:4001/d/abc" },
      }) ?? {};
    expect(env).not.toHaveProperty("PH_CONNECT_PACKAGES_REGISTRY");
  });

  it("forwards registryUrl as PH_CONNECT_PACKAGES_REGISTRY when set", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
      registryUrl: "https://registry.example.com",
    });
    const env = svc.env?.({
      config: {},
      proxy: { basePath: "" },
      params: { driveUrl: "http://localhost:4001/d/abc" },
    });
    expect(env).toEqual({
      PH_CONNECT_DEFAULT_DRIVES_URL: "http://localhost:4001/d/abc",
      PH_CONNECT_DRIVES_PRESERVE_STRATEGY: "preserve-all",
      PH_CONNECT_PACKAGES_REGISTRY: "https://registry.example.com",
    });
  });

  it("has readiness patterns for Connect", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    expect(svc.readiness?.patterns).toHaveLength(1);
    expect(svc.readiness?.patterns?.[0].name).toBe("connect");
    expect(svc.readiness?.timeout).toBe(30_000);
  });

  it("has SIGTERM shutdown config", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    expect(svc.shutdown?.signal).toBe("SIGTERM");
    expect(svc.shutdown?.timeout).toBe(5_000);
  });

  it("has restart disabled", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "test-connect",
    });
    expect(svc.restart?.enabled).toBe(false);
  });

  it("static mode converges on ph-cli connect preview (P5.7)", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "static-connect",
      assetsDir: "/path/to/assets",
    });
    const cmd =
      typeof svc.command === "function"
        ? svc.command({
            config: {},
            proxy: { basePath: "" },
            params: { port: 3000 },
          })
        : svc.command;
    // One static-serve implementation: the hand-rolled connect-server is gone.
    expect(cmd).toContain("ph-cli connect preview");
    expect(cmd).toContain('--outDir "/path/to/assets"');
    expect(cmd).toContain("--port 3000");
    expect(cmd).not.toContain("connect-server.js");
  });

  it("static mode has no checkCommand preflight", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "static-connect",
      assetsDir: "/path/to/assets",
    });
    // Static mode skips checkCommand('ph') — only has checkPort
    expect(svc.preflight).toHaveLength(1);
  });

  it("studio mode includes checkCommand and checkPort preflight", () => {
    const svc = connectServiceDefinition({
      enabled: true,
      port: 3000,
      name: "studio-connect",
    });
    expect(svc.preflight).toHaveLength(2);
  });
});

describe("bridgeSubscriptions", () => {
  it("maps Created events to powerhouse:document:created", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (search: any, callback: any) => {
        // Simulate a Created event
        callback({
          type: "created",
          documents: [
            { header: { id: "doc-1", documentType: "conversation" } },
            { header: { id: "doc-2", documentType: "task" } },
          ],
        });
        return () => {};
      },
    };

    bridgeSubscriptions(
      mockClient as any,
      { documentTypes: ["conversation"] },
      emit,
    );
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:created",
      data: { documentId: "doc-1", documentType: "conversation" },
    });
    expect(emitted[1]).toEqual({
      event: "powerhouse:document:created",
      data: { documentId: "doc-2", documentType: "task" },
    });
  });

  it("maps Updated events to powerhouse:document:changed", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });
    const docs = [{ header: { id: "doc-1", documentType: "conversation" } }];

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        callback({ type: "updated", documents: docs });
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:changed",
      data: { changeType: "updated", documents: docs },
    });
  });

  it("maps Deleted events to powerhouse:document:deleted", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        callback({ type: "deleted", documents: [{ header: { id: "doc-1" } }] });
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "powerhouse:document:deleted",
      data: { documentId: "doc-1" },
    });
  });

  it("returns unsubscribe function", () => {
    const unsub = vi.fn();
    const mockClient = {
      subscribe: () => unsub,
    };

    const result = bridgeSubscriptions(mockClient as any, {}, () => {});
    result();
    expect(unsub).toHaveBeenCalled();
  });

  it("passes documentTypes filter to client.subscribe", () => {
    let receivedSearch: any;
    const mockClient = {
      subscribe: (search: any, _callback: any) => {
        receivedSearch = search;
        return () => {};
      },
    };

    bridgeSubscriptions(
      mockClient as any,
      { documentTypes: ["conversation", "task"] },
      () => {},
    );
    expect(receivedSearch).toEqual({ documentTypes: ["conversation", "task"] });
  });

  it("handles errors in the callback without crashing", () => {
    const emit = () => {
      throw new Error("boom");
    };
    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        // Should not throw even though emit throws
        expect(() => {
          callback({
            type: "created",
            documents: [{ header: { id: "x", documentType: "t" } }],
          });
        }).not.toThrow();
        return () => {};
      },
    };

    bridgeSubscriptions(mockClient as any, {}, emit);
  });

  it("handles missing documents array gracefully", () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = (event: string, data?: unknown) =>
      emitted.push({ event, data });

    const mockClient = {
      subscribe: (_search: any, callback: any) => {
        // Created event with undefined documents
        callback({ type: "created" });
        return () => {};
      },
    };

    // Should not throw
    bridgeSubscriptions(mockClient as any, {}, emit);
    expect(emitted).toHaveLength(0);
  });
});

describe("ensureDrive", () => {
  /** Helper to build a mock ReactorClientModule with only the methods ensureDrive uses. */
  function mockModule(overrides: {
    findByType?: ReactorClientModule["reactor"]["findByType"];
    get?: (
      id: string,
    ) => Promise<{ name?: string; state?: { global?: { name?: string } } }>;
    createEmpty?: (...args: unknown[]) => Promise<{ header: { id: string } }>;
    rename?: (id: string, name: string) => Promise<void>;
  }): ReactorClientModule {
    return {
      client: {
        get: overrides.get ?? (async () => ({})),
        createEmpty:
          overrides.createEmpty ??
          (async () => ({ header: { id: "fallback" } })),
        rename: overrides.rename ?? (async () => {}),
      },
      reactor: {
        findByType: overrides.findByType ?? (async () => ({ results: [] })),
        kill: () => ({ completed: Promise.resolve() }),
      },
    } as unknown as ReactorClientModule;
  }

  it("returns existing drive when name matches", async () => {
    const mod = mockModule({
      findByType: async () => ({
        results: [{ header: { id: "existing-drive-id" } }],
      }),
      get: async () => ({ name: "My Drive" }),
    });

    const result = await ensureDrive(mod, { name: "My Drive" });
    expect(result).toEqual({ id: "existing-drive-id", name: "My Drive" });
  });

  it("falls back to first drive when default name and single drive exists", async () => {
    const mod = mockModule({
      findByType: async () => ({
        results: [{ header: { id: "existing-drive-id" } }],
      }),
      get: async () => ({ name: "something-else" }),
    });

    const result = await ensureDrive(mod);
    expect(result).toEqual({ id: "existing-drive-id", name: "default" });
  });

  it("creates a new drive when none exist", async () => {
    const mod = mockModule({
      createEmpty: async () => ({ header: { id: "new-drive-id" } }),
    });

    const result = await ensureDrive(mod, { name: "Test Drive" });
    expect(result).toEqual({ id: "new-drive-id", name: "Test Drive" });
  });

  it("renames drive with config name", async () => {
    let renamedWith: { id: string; name: string } | undefined;
    const mod = mockModule({
      createEmpty: async () => ({ header: { id: "new-id" } }),
      rename: async (id: string, name: string) => {
        renamedWith = { id, name };
      },
    });

    await ensureDrive(mod, { name: "My Agent" });
    expect(renamedWith?.id).toBe("new-id");
    expect(renamedWith?.name).toBe("My Agent");
  });

  it("uses default name when no config provided", async () => {
    let renamedWith: { id: string; name: string } | undefined;
    const mod = mockModule({
      createEmpty: async () => ({ header: { id: "new-id" } }),
      rename: async (id: string, name: string) => {
        renamedWith = { id, name };
      },
    });

    await ensureDrive(mod);
    expect(renamedWith?.name).toBe("default");
  });

  it("handles empty results from findByType", async () => {
    const mod = mockModule({
      createEmpty: async () => ({ header: { id: "new-drive-id" } }),
    });

    const result = await ensureDrive(mod);
    expect(result).toEqual({ id: "new-drive-id", name: "default" });
  });

  it("creates new drive when name does not match any existing (non-default)", async () => {
    const mod = mockModule({
      findByType: async () => ({
        results: [{ header: { id: "drive-a" } }],
      }),
      get: async () => ({ name: "Other Drive" }),
      createEmpty: async () => ({ header: { id: "new-id" } }),
    });

    const result = await ensureDrive(mod, { name: "My Drive" });
    expect(result).toEqual({ id: "new-id", name: "My Drive" });
  });

  it("matches drive by state.global.name", async () => {
    const mod = mockModule({
      findByType: async () => ({
        results: [{ header: { id: "drive-x" } }],
      }),
      get: async () => ({ state: { global: { name: "Clint" } } }),
    });

    const result = await ensureDrive(mod, { name: "Clint" });
    expect(result).toEqual({ id: "drive-x", name: "Clint" });
  });

  it("returns existing drive when deterministic id matches", async () => {
    const mod = mockModule({
      findByType: async () => ({
        results: [
          { header: { id: "drive-deterministic" } },
          { header: { id: "drive-other" } },
        ],
      }),
    });

    const result = await ensureDrive(mod, {
      id: "drive-deterministic",
      name: "Named",
    });
    expect(result).toEqual({ id: "drive-deterministic", name: "Named" });
  });
});

describe("deterministicId", () => {
  it("produces a stable UUID-shaped string from (cliName, salt)", () => {
    const id = deterministicId("my-cli", "personal-drive");
    // Deterministic: same inputs always produce the same output
    expect(deterministicId("my-cli", "personal-drive")).toBe(id);
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("produces different IDs for different inputs", () => {
    const a = deterministicId("cli-a", "salt");
    const b = deterministicId("cli-b", "salt");
    const c = deterministicId("cli-a", "other");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("ensureRemoteDrive", () => {
  function mockModule(overrides: {
    addRemoteDrive?: (
      url: string,
    ) => Promise<{ header?: { id: string }; id?: string }>;
    rename?: (id: string, name: string) => Promise<void>;
  }): ReactorClientModule {
    return {
      client: {
        addRemoteDrive:
          overrides.addRemoteDrive ??
          (async () => ({ header: { id: "remote-1" } })),
        rename: overrides.rename ?? (async () => {}),
      },
      reactor: {
        findByType: async () => ({ results: [] }),
        kill: () => ({ completed: Promise.resolve() }),
      },
    } as unknown as ReactorClientModule;
  }

  it("returns drive id from addRemoteDrive result (header.id)", async () => {
    const mod = mockModule({
      addRemoteDrive: async () => ({ header: { id: "remote-abc" } }),
    });
    const result = await ensureRemoteDrive(
      mod,
      "http://example.com/d/xyz",
      "Watched",
    );
    expect(result).toEqual({ id: "remote-abc", name: "Watched" });
  });

  it("falls back to result.id when header is absent", async () => {
    const mod = mockModule({
      addRemoteDrive: async () => ({ id: "flat-id" }),
    });
    const result = await ensureRemoteDrive(
      mod,
      "http://example.com/d/xyz",
      "Watched",
    );
    expect(result).toEqual({ id: "flat-id", name: "Watched" });
  });

  it("renames the drive after adding", async () => {
    let renamedWith: { id: string; name: string } | undefined;
    const mod = mockModule({
      addRemoteDrive: async () => ({ header: { id: "r-1" } }),
      rename: async (id: string, name: string) => {
        renamedWith = { id, name };
      },
    });
    await ensureRemoteDrive(mod, "http://example.com", "My Remote");
    expect(renamedWith).toEqual({ id: "r-1", name: "My Remote" });
  });

  it("does not throw when rename fails", async () => {
    const mod = mockModule({
      rename: async () => {
        throw new Error("rename not supported");
      },
    });
    const result = await ensureRemoteDrive(mod, "http://example.com", "X");
    expect(result.id).toBe("remote-1");
  });
});

describe("ReactorContext type", () => {
  it("has the expected shape", () => {
    const ctx: ReactorContext = {
      client: {} as any,
      driveId: "test-drive",
      async shutdown() {},
    };
    expect(ctx.driveId).toBe("test-drive");
    expect(ctx.switchboardUrl).toBeUndefined();
    expect(ctx.driveUrl).toBeUndefined();
    expect(ctx.mcpUrl).toBeUndefined();
    expect(ctx.connectUrl).toBeUndefined();
    expect(ctx.drives).toBeUndefined();
    expect(ctx.personalDriveId).toBeUndefined();
  });

  it("accepts all optional Phase 2+3 fields", () => {
    const ctx: ReactorContext = {
      client: {} as any,
      driveId: "test",
      personalDriveId: "test",
      drives: [{ id: "test", name: "Test", role: "personal" }],
      switchboardUrl: "http://localhost:4001/graphql",
      driveUrl: "http://localhost:4001/d/test",
      mcpUrl: "http://localhost:4001/mcp",
      connectUrl: "http://localhost:3000",
      async shutdown() {},
    };
    expect(ctx.switchboardUrl).toBe("http://localhost:4001/graphql");
    expect(ctx.connectUrl).toBe("http://localhost:3000");
    expect(ctx.drives).toHaveLength(1);
    expect(ctx.personalDriveId).toBe("test");
  });
});

describe("buildDefaultReactor", () => {
  it("is exported as a function", () => {
    expect(typeof buildDefaultReactor).toBe("function");
  });
});

// ── Real integration tests (PGlite + Switchboard) ────────────────

const testDir = join(
  tmpdir(),
  `ph-clint-ph-test-${randomBytes(4).toString("hex")}`,
);

async function findFreePort(): Promise<number> {
  const base = 40000 + Math.floor(Math.random() * 10000);
  for (let p = base; p < base + 100; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error("No free port found");
}

afterAll(async () => {
  try {
    await rm(testDir, { recursive: true });
  } catch {}
});

describe("Powerhouse real integration", () => {
  let reactorModule: ReactorClientModule;
  let driveId: string;
  let switchboard: SwitchboardInstance;

  afterAll(async () => {
    if (switchboard) await switchboard.shutdown();
    if (reactorModule) {
      try {
        const status = reactorModule.reactor.kill();
        await status.completed;
      } catch {}
    }
  });

  it("buildReactor creates a PGlite-backed reactor", async () => {
    // Pass empty documentModels — buildReactor already includes base models
    // (documentModelDocumentModelModule + driveDocumentModelModule) internally.
    // enableSync is left false: the enableSync=true path lazy-imports
    // @powerhousedao/switchboard/server → @mercuriusjs/gateway → p-map (ESM-only),
    // which Jest's CJS runtime cannot load (same reason the startSwitchboard
    // tests below are skipped). The standalone path exercises the same
    // PGlite + kysely + document-drive wiring this test asserts on.
    reactorModule = await buildReactor({
      documentModels: [],
      storagePath: join(testDir, "reactor-storage"),
      enableSync: false,
    });
    expect(reactorModule).toBeDefined();
    expect(reactorModule.client).toBeDefined();
    expect(reactorModule.reactor).toBeDefined();
  });

  // Skipped for the same reason as the startSwitchboard tests below:
  // applySwitchboardReactorDefaults pulls in @mercuriusjs/gateway → p-map (ESM)
  // which Jest's CJS runtime cannot require(). Covered by the planned c8 +
  // node:test integration runner (see specs/plans/unified-coverage.md).
  it.skip("buildReactor({ enableSync: true }) applies switchboard reactor defaults", async () => {
    const mod = await buildReactor({
      documentModels: [],
      storagePath: join(testDir, "reactor-storage-sync"),
      enableSync: true,
    });
    expect(mod.client).toBeDefined();
    expect(mod.reactor).toBeDefined();
  });

  it("ensureDrive creates a drive on first call", async () => {
    const result = await ensureDrive(reactorModule, { name: "test-drive" });
    driveId = result.id;
    expect(typeof driveId).toBe("string");
    expect(driveId.length).toBeGreaterThan(0);
    expect(result.name).toBe("test-drive");
  });

  it("ensureDrive returns the same drive on second call", async () => {
    const result = await ensureDrive(reactorModule, { name: "test-drive" });
    expect(result.id).toBe(driveId);
  });

  // Switchboard tests are skipped: @mercuriusjs/gateway (CJS) requires p-map (ESM-only).
  // Jest's CJS runtime cannot load ESM modules via require(). These tests need to run
  // outside Jest (e.g. node:test + c8) — tracked in specs/plans/unified-coverage.md.
  it.skip("startSwitchboard exposes GraphQL + MCP endpoints", async () => {
    const port = await findFreePort();
    switchboard = await startSwitchboard({
      reactorModule,
      port,
      dbPath: join(testDir, "read-model.db"),
      driveId,
    });
    expect(switchboard.switchboardUrl).toContain(`${port}/graphql`);
    expect(switchboard.mcpUrl).toContain(`${port}/mcp`);
    expect(switchboard.driveUrl).toContain(`${port}/d/${driveId}`);
  });

  it.skip("GraphQL endpoint responds to introspection", async () => {
    const response = await fetch(switchboard.switchboardUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(response.ok).toBe(true);
    const body = (await response.json()) as any;
    expect(body.data).toBeDefined();
  });

  it.skip("GraphQL endpoint lists drives", async () => {
    const response = await fetch(switchboard.switchboardUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ drives { id name } }" }),
    });
    expect(response.ok).toBe(true);
    const body = (await response.json()) as any;
    expect(body.data.drives).toBeDefined();
    expect(body.data.drives.length).toBeGreaterThan(0);
  });
});

describe("buildSwitchboardInstance", () => {
  it("constructs correct URLs with default host", () => {
    const instance = buildSwitchboardInstance(
      { port: 4001, driveId: "abc-123" },
      { shutdown: async () => {} },
    );
    expect(instance.switchboardUrl).toBe("http://localhost:4001/graphql");
    expect(instance.driveUrl).toBe("http://localhost:4001/d/abc-123");
    expect(instance.mcpUrl).toBe("http://localhost:4001/mcp");
  });

  it("constructs correct URLs with custom host", () => {
    const instance = buildSwitchboardInstance(
      { host: "0.0.0.0", port: 5000, driveId: "drive-x" },
      { shutdown: async () => {} },
    );
    expect(instance.switchboardUrl).toBe("http://0.0.0.0:5000/graphql");
    expect(instance.driveUrl).toBe("http://0.0.0.0:5000/d/drive-x");
    expect(instance.mcpUrl).toBe("http://0.0.0.0:5000/mcp");
  });

  it("shutdown awaits the handle.shutdown() function", async () => {
    let stopped = false;
    const instance = buildSwitchboardInstance(
      { port: 4001, driveId: "d" },
      {
        shutdown: async () => {
          stopped = true;
        },
      },
    );
    await instance.shutdown();
    expect(stopped).toBe(true);
  });

  it("shutdown swallows errors (best-effort)", async () => {
    const instance = buildSwitchboardInstance(
      { port: 4001, driveId: "d" },
      {
        shutdown: async () => {
          throw new Error("boom");
        },
      },
    );
    // Should not throw
    await instance.shutdown();
  });
});

describe("buildDefaultReactor (real)", () => {
  let reactorCtx: ReactorContext;

  afterAll(async () => {
    if (reactorCtx) await reactorCtx.shutdown();
  });

  it("creates reactor context with client and driveId", async () => {
    const workspace = createMemoryWorkdirStore(testDir);
    const events: Array<{ event: string; data: unknown }> = [];

    // Pass empty documentModels — buildReactor already includes base models
    // (documentModelDocumentModelModule + driveDocumentModelModule) internally.
    reactorCtx = await buildDefaultReactor(
      {
        workdir: testDir,
        config: {},
        workspace,
        emit: ((event: string, data?: unknown) => {
          events.push({ event, data });
        }) as any,
        switchboard: { enabled: false },
      },
      { documentModels: [], drive: { name: "default-reactor-test" } },
    );

    expect(reactorCtx.client).toBeDefined();
    expect(typeof reactorCtx.driveId).toBe("string");
    expect(typeof reactorCtx.shutdown).toBe("function");
    expect(events.some((e) => e.event === "powerhouse:ready")).toBe(true);
  });
});

describe("defineCli + configureReactor", () => {
  it("CLI with reactor reports hasReactor in metadata", async () => {
    const noopCmd = defineCommand({
      id: "noop",
      description: "No-op",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    });

    const cli = defineCli({
      name: "ph-test-reactor",
      version: "0.0.1",
      description: "Test CLI with reactor",
      commands: [noopCmd],
    });

    cli.configureReactor({
      create: (ctx) =>
        buildDefaultReactor(ctx, {
          documentModels: [],
          drive: { name: "test-cli-drive" },
        }),
      switchboard: { enabled: false },
    });

    expect(cli.hasReactor).toBe(true);

    // argv must include node + script prefix — runImpl does argv.slice(2)
    let metaOutput = "";
    await cli.run(["node", "test", "--meta"], {
      stdout: (text: string) => {
        metaOutput += text;
      },
      stderr: () => {},
      exit: () => {},
    });

    const parsed = JSON.parse(metaOutput);
    expect(parsed.name).toBe("ph-test-reactor");
    expect(parsed.hasReactor).toBe(true);
  });
});

describe("defineRegistry", () => {
  it("builds a registry keyed by documentModel.global.id", () => {
    const moduleA = {
      documentModel: { global: { id: "test/a" } },
      actions: {},
    } as unknown as Parameters<typeof defineRegistry>[0][number];
    const moduleB = {
      documentModel: { global: { id: "test/b" } },
      actions: {},
    } as unknown as Parameters<typeof defineRegistry>[0][number];

    const registry = defineRegistry([moduleA, moduleB] as const);

    expect(Object.keys(registry)).toEqual(["test/a", "test/b"]);
    expect((registry as Record<string, unknown>)["test/a"]).toBe(moduleA);
    expect((registry as Record<string, unknown>)["test/b"]).toBe(moduleB);
  });

  it("returns an empty registry for an empty tuple", () => {
    const registry = defineRegistry([] as const);
    expect(Object.keys(registry)).toEqual([]);
  });
});
