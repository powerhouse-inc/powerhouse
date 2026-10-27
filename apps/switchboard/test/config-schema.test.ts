import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  switchboardConfigLayerSchema,
  switchboardConfigSchema,
  type SwitchboardConfigInput,
} from "../src/config/schema.js";

describe("switchboardConfigSchema", () => {
  it("fills every default from an empty layer", () => {
    const config = switchboardConfigSchema.parse({});
    expect(config.logLevel).toBe("info");
    expect(config.server).toEqual({
      port: 4001,
      strictPort: false,
      basePath: "/",
      gatewayAdapter: "apollo",
      dev: false,
    });
    expect(config.storage).toEqual({
      reactor: {},
      readModel: {},
      inMemory: false,
      pglite: { fsync: true, workers: true, vacuumFull: { mode: "off" } },
      migratePglite: false,
    });
    expect(config.protocol).toEqual({
      featureFlags: {
        documentDecisions: false,
        authEnforcement: false,
        authGroups: false,
        authConditions: false,
      },
      createSignaturePolicy: "v2-required",
      unsupportedStoredDocuments: "refuse",
      legacyProcessorIds: true,
      catchUpPriority: "dynamic",
    });
    expect(config.workers).toEqual({
      executor: { count: 0, poolSize: 2, acquireTimeoutMs: 5000 },
      hostPoolSize: 16,
      projection: { enabled: false, poolSize: 8 },
    });
    expect(config.inspection).toEqual({ enabled: true, admin: false });
    expect(config.features).toEqual({
      documentModelSubgraphs: true,
      pluginHost: false,
      privacy: { enabled: false },
    });
    expect(config.attachments).toEqual({ storage: { kind: "filesystem" } });
    expect(config.auth.documentPermissions).toEqual({ enabled: false });
  });

  it("keeps the defaults beside a nested value a layer sets", () => {
    const layer: SwitchboardConfigInput = {
      workers: { executor: { count: "auto" } },
      storage: { pglite: { vacuumFull: { mode: "quiet" } } },
    };
    const config = switchboardConfigSchema.parse(layer);
    expect(config.workers.executor).toEqual({
      count: "auto",
      poolSize: 2,
      acquireTimeoutMs: 5000,
    });
    expect(config.workers.hostPoolSize).toBe(16);
    expect(config.storage.pglite).toEqual({
      fsync: true,
      workers: true,
      vacuumFull: { mode: "quiet" },
    });
  });

  it.each<[string, SwitchboardConfigInput]>([
    ["a port out of range", { server: { port: 70000 } }],
    ["a fractional worker count", { workers: { executor: { count: 1.5 } } }],
    ["a host pool of 0", { workers: { hostPoolSize: 0 } }],
    ["a catch-up level above 7", { protocol: { catchUpPriority: 8 } }],
    [
      "an unknown signature policy",
      { protocol: { createSignaturePolicy: "v3" as "legacy" } },
    ],
    ["a PG major it does not ship", { storage: { forcePgVersion: 15 as 16 } }],
  ])("refuses %s", (_name, layer) => {
    expect(switchboardConfigSchema.safeParse(layer).success).toBe(false);
  });
});

describe("the config modules", () => {
  it("load without the server", async () => {
    vi.doMock("../src/server.mjs", () => {
      throw new Error("the server was loaded");
    });
    await expect(import("../src/config/from-env.js")).resolves.toBeDefined();
    vi.doUnmock("../src/server.mjs");
  });
});

describe("switchboardConfigLayerSchema", () => {
  const layer = switchboardConfigLayerSchema(["server.port", "drive"]);

  it("keeps a layer as written, without defaults", () => {
    expect(layer.parse({})).toEqual({});
    expect(layer.parse({ auth: { enabled: true } })).toEqual({
      auth: { enabled: true },
    });
  });

  it("validates values and refuses unknown or omitted keys", () => {
    expect(
      layer.safeParse({ workers: { executor: { count: "auto" } } }),
    ).toMatchObject({ success: true });
    expect(
      layer.safeParse({ workers: { executor: { count: -1 } } }).success,
    ).toBe(false);
    expect(layer.safeParse({ auth: { enabeld: true } }).success).toBe(false);
    expect(layer.safeParse({ server: { port: 1 } }).success).toBe(false);
    expect(layer.safeParse({ drive: {} }).success).toBe(false);
    expect(layer.safeParse({ server: { basePath: "/x" } }).success).toBe(true);
  });

  it("emits a JSON Schema once the map key is omitted", () => {
    const schema = z.toJSONSchema(
      switchboardConfigLayerSchema(["processorConfig"]),
      { io: "input" },
    );
    expect(schema).toMatchObject({ additionalProperties: false });
  });
});
