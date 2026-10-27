import type { ILogger } from "document-model";
import { describe, expect, it } from "vitest";
import { switchboardConfigFromEnv } from "../src/config/from-env.js";
import {
  callerOverEnv,
  mergeSwitchboardConfig,
  switchboardConfigSchema,
  type SwitchboardConfig,
  type SwitchboardConfigInput,
} from "../src/config/schema.js";

type Env = Record<string, string | undefined>;

const silent = { warn: () => undefined } as unknown as ILogger;

function resolved(env: Env, caller: SwitchboardConfigInput): SwitchboardConfig {
  return switchboardConfigSchema.parse(
    callerOverEnv(switchboardConfigFromEnv(env, { logger: silent }), caller),
  );
}

describe("mergeSwitchboardConfig", () => {
  it("lets a later layer win per key and keeps the rest", () => {
    expect(
      mergeSwitchboardConfig(
        { server: { port: 1, basePath: "/a" }, logLevel: "debug" },
        { server: { port: 2 } },
        { server: { port: undefined } },
      ),
    ).toEqual({ server: { port: 2, basePath: "/a" }, logLevel: "debug" });
  });

  it("replaces arrays, maps and the attachment storage whole", () => {
    const s3 = {
      kind: "s3" as const,
      s3: {
        endpoint: "e",
        region: "r",
        bucket: "b",
        accessKeyId: "a",
        secretAccessKey: "s",
        prefix: "p",
        forcePathStyle: false,
        uploadTtlSeconds: 1,
        downloadTtlSeconds: 1,
      },
    };
    const processorConfig = new Map([["b", 2]]);
    expect(
      mergeSwitchboardConfig(
        {
          auth: { admins: ["0xa", "0xb"] },
          attachments: { storage: s3 },
          processorConfig: new Map([["a", 1]]),
        },
        {
          auth: { admins: ["0xc"] },
          attachments: { storage: { kind: "filesystem" } },
          processorConfig,
        },
      ),
    ).toEqual({
      auth: { admins: ["0xc"] },
      attachments: { storage: { kind: "filesystem" } },
      processorConfig,
    });
  });
});

describe("callerOverEnv keeps each key's precedence", () => {
  it("lets the caller win an ordinary key", () => {
    const config = resolved(
      {
        PH_REGISTRY_URL: "https://env",
        PH_PGLITE_WORKERS: "true",
        PH_WORKFLOWS_ENABLED: "1",
        DATABASE_URL: "/env/read",
        PH_REACTOR_DATABASE_URL: "/env/reactor",
      },
      {
        packages: { registryUrl: "https://caller" },
        storage: {
          pglite: { workers: false },
          readModel: { url: "/caller" },
          reactor: { url: "/caller" },
        },
        features: { workflows: false },
      },
    );
    expect(config.packages.registryUrl).toBe("https://caller");
    expect(config.storage.pglite.workers).toBe(false);
    expect(config.features.workflows).toBe(false);
    expect(config.storage.readModel.url).toBe("/caller");
    expect(config.storage.reactor.url).toBe("/caller");
  });

  it("falls back to the env where the caller says nothing", () => {
    const config = resolved(
      { PH_PGLITE_WORKERS: "false", PH_WORKFLOWS_ENABLED: "0" },
      {},
    );
    expect(config.storage.pglite.workers).toBe(false);
    expect(config.features.workflows).toBe(false);
  });

  it("lets DOCUMENT_MODEL_SUBGRAPHS_ENABLED win over the caller", () => {
    expect(
      resolved(
        { DOCUMENT_MODEL_SUBGRAPHS_ENABLED: "false" },
        { features: { documentModelSubgraphs: true } },
      ).features.documentModelSubgraphs,
    ).toBe(false);
    expect(
      resolved({}, { features: { documentModelSubgraphs: false } }).features
        .documentModelSubgraphs,
    ).toBe(false);
  });

  it("lets reactor-api's overriding auth env vars win over the caller", () => {
    const { auth } = resolved(
      {
        AUTH_ENABLED: "false",
        ADMINS: "0xEnv",
        RESOLVE_CALLER_IDENTITY: "false",
        REQUIRE_AUTHENTICATED_CALLER: "false",
        REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS: "/env",
        ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY: "false",
        DEFAULT_PROTECTION: "false",
      },
      {
        auth: {
          enabled: true,
          admins: ["0xcaller"],
          resolveIdentity: true,
          requireAuthenticatedCaller: true,
          requireAuthenticatedCallerExemptPaths: ["/caller"],
          attachmentReadsFollowDocumentPolicy: true,
          defaultProtection: true,
        },
      },
    );
    expect(auth).toMatchObject({
      enabled: false,
      admins: ["0xenv"],
      resolveIdentity: false,
      requireAuthenticatedCaller: false,
      requireAuthenticatedCallerExemptPaths: ["/env"],
      attachmentReadsFollowDocumentPolicy: false,
      // An ordinary key: the caller wins.
      defaultProtection: true,
    });
  });

  it.each([
    [{}, undefined, true],
    [{ MCP_ENABLED: "false" }, undefined, false],
    [{ MCP_ENABLED: "false" }, true, false],
    [{ MCP_ENABLED: "true" }, false, false],
    [{ MCP_ENABLED: "yes" }, undefined, true],
    [{}, false, false],
  ] as const)(
    "MCP: env %o with the caller's %s mounts it: %s",
    (env, mcp, mounted) => {
      expect(resolved(env, { features: { mcp } }).features.mcp ?? true).toBe(
        mounted,
      );
    },
  );

  it.each([
    [{}, undefined, true],
    [{ INSPECTION_ENABLED: "false" }, undefined, false],
    [{ INSPECTION_ENABLED: "false" }, true, false],
    [{ INSPECTION_ENABLED: "true" }, false, false],
    [{ INSPECTION_ENABLED: "0" }, undefined, true],
    [{ INSPECTION_ENABLED: "true" }, undefined, true],
  ] as const)(
    "inspection: env %o with the caller's %s mounts it: %s",
    (env, enabled, mounted) => {
      expect(
        resolved(env, { inspection: { enabled } }).inspection.enabled,
      ).toBe(mounted);
    },
  );

  it("ignores MCP_ENABLED and PH_WORKFLOWS_ENABLED under the plugin host", () => {
    const env = {
      FEATURE_PLUGIN_HOST_ENABLED: "1",
      MCP_ENABLED: "false",
      PH_WORKFLOWS_ENABLED: "true",
    };
    const host = resolved(env, {});
    expect(host.features.pluginHost).toBe(true);
    expect(host.features.mcp).toBeUndefined();
    expect(host.features.workflows).toBeUndefined();
    const withCaller = resolved(env, {
      features: { mcp: false, workflows: true },
    });
    expect(withCaller.features.mcp).toBe(false);
    expect(withCaller.features.workflows).toBe(true);
    // Not carved: classic on both paths.
    expect(
      resolved({ ...env, INSPECTION_ENABLED: "false" }, {}).inspection.enabled,
    ).toBe(false);
  });
});

describe("startSwitchboard", () => {
  it("refuses the old options shape instead of booting on defaults", async () => {
    const { startSwitchboard } = await import("../src/server.mjs");
    await expect(
      startSwitchboard({ port: 0, dbPath: "x" } as SwitchboardConfigInput),
    ).rejects.toThrow("unknown config keys: port, dbPath");
  });
});
