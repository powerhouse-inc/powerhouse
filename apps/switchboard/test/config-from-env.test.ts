import { parseCatchUpPriority } from "@powerhousedao/reactor";
import {
  reactorApiConfigFromEnv,
  resolveCredentialCacheTtlMs,
  resolveRenownConfig,
} from "@powerhousedao/reactor-api";
import {
  resolvePgliteFsync,
  resolvePgliteMaintenance,
  resolvePgliteWorkerMemoryMb,
} from "@powerhousedao/reactor-api/pglite-node";
import { parseAttachmentStorageConfig } from "@powerhousedao/reactor-attachments";
import { defaultStoreDirs } from "@powerhousedao/shared/clis/ph-dir";
import type { ILogger } from "document-model";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveAttachmentUrlSigning } from "../src/attachments/url-signer.js";
import { reactorDbUrlOf } from "../src/boot-preconditions.mjs";
import { switchboardConfigFromEnv } from "../src/config/from-env.js";
import {
  mergeSwitchboardConfig,
  switchboardConfigSchema,
  type SwitchboardConfig,
} from "../src/config/schema.js";
import { resolveCreateSignaturePolicy } from "../src/create-signature-policy.mjs";
import { EnvVarProvider } from "@openfeature/env-var-provider";
import { OpenFeature } from "@openfeature/server-sdk";
import { binSwitchboardConfig } from "../src/config/bin.js";
import { inspectionThrottleFromEnv } from "../src/inspection-throttle.mjs";
import { isPluginHostEnabled } from "../src/plugin-host.mjs";
import { resolvePrivacy } from "../src/privacy.mjs";
import { resolveProjectionWorkerOptions } from "../src/projection-worker.mjs";
import { resolveReactorFeatureFlags } from "../src/reactor-feature-flags.mjs";
import { resolveUnsupportedStoredDocuments } from "../src/unsupported-stored-documents.mjs";
import {
  resolveHostPoolSize,
  resolveWorkerPoolOptions,
} from "../src/worker-pool.mjs";

// The OpenFeature client the boot read these switches through before the config.
type BooleanFlagSource = {
  getBooleanValue(flagKey: string, defaultValue: boolean): Promise<boolean>;
};

async function initFeatureFlags(): Promise<BooleanFlagSource> {
  await OpenFeature.setProviderAndWait(new EnvVarProvider());
  return OpenFeature.getClient();
}

// PH_WORKFLOWS_ENABLED's 1/0 forms, then the client, then the config file's (off).
function workflowsBefore(featureFlags: BooleanFlagSource, env: Env) {
  const raw = env.PH_WORKFLOWS_ENABLED?.trim();
  if (raw === "1") return Promise.resolve(true);
  if (raw === "0") return Promise.resolve(false);
  return featureFlags.getBooleanValue("PH_WORKFLOWS_ENABLED", false);
}

type Env = Record<string, string | undefined>;

// Stubbed per row: the real OpenFeature provider reads process.env.
const KEYS = [
  "LOG_LEVEL",
  "PORT",
  "BASE_PATH",
  "PUBLIC_URL",
  "RENDER_EXTERNAL_URL",
  "HEROKU_APP_DEFAULT_DOMAIN_NAME",
  "GATEWAY_ADAPTER",
  "PH_REACTOR_DATABASE_URL",
  "PH_SWITCHBOARD_DATABASE_URL",
  "DATABASE_URL",
  "PH_PGLITE_IN_MEMORY",
  "PH_USER_DATA_DIR",
  "PH_PGLITE_FSYNC",
  "PH_PGLITE_WORKERS",
  "PH_PGLITE_WORKER_MEMORY_MB",
  "PH_PGLITE_VACUUM_FULL",
  "PH_PGLITE_VACUUM_FULL_ABOVE_MB",
  "PH_PGLITE_VACUUM_FULL_QUIET_MS",
  "PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS",
  "REACTOR_DOCUMENT_DECISIONS",
  "REACTOR_AUTH_ENFORCEMENT",
  "REACTOR_AUTH_GROUPS",
  "REACTOR_AUTH_CONDITIONS",
  "CREATE_SIGNATURE_POLICY",
  "REACTOR_UNSUPPORTED_STORED_DOCUMENTS",
  "REACTOR_LEGACY_PROCESSOR_IDS",
  "MAX_SKIP_THRESHOLD",
  "PH_CATCH_UP_PRIORITY",
  "PH_KEYFRAMES",
  "AUTH_ENABLED",
  "RESOLVE_CALLER_IDENTITY",
  "REQUIRE_AUTHENTICATED_CALLER",
  "REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS",
  "ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY",
  "ADMINS",
  "DEFAULT_PROTECTION",
  "DOCUMENT_PERMISSIONS_ENABLED",
  "DOCUMENT_PERMISSION_CACHE_TTL_MS",
  "SKIP_CREDENTIAL_VERIFICATION",
  "ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION",
  "CREDENTIAL_VERIFICATION_CACHE_TTL_MS",
  "WS_CREDENTIAL_RECHECK_INTERVAL_MS",
  "RENOWN_SOURCE",
  "RENOWN_URL",
  "SWITCHBOARD_URL",
  "INSPECTION_ENABLED",
  "INSPECTION_ADMIN_ENABLED",
  "PH_INSPECTION_CALLS_PER_MINUTE",
  "REACTOR_WORKERS",
  "REACTOR_DB_POOL_SIZE_WORKER",
  "REACTOR_DB_ACQUIRE_TIMEOUT_MS",
  "REACTOR_DB_POOL_SIZE_HOST",
  "REACTOR_PROJECTION_WORKER",
  "REACTOR_DB_POOL_SIZE_PROJECTION",
  "PH_REGISTRY_URL",
  "PH_REGISTRY_PACKAGES",
  "DYNAMIC_MODEL_LOADING",
  "MCP_ENABLED",
  "PH_WORKFLOWS_ENABLED",
  "DOCUMENT_MODEL_SUBGRAPHS_ENABLED",
  "FEATURE_PLUGIN_HOST_ENABLED",
  "PH_PRIVACY_ENABLED",
  "PH_PRIVACY_DEPLOYMENT_SECRET",
  "PH_PRIVACY_INTERVAL_MS",
  "PH_PRIVACY_DEADLINE_DAYS",
  "PH_PRIVACY_MARKER_GRACE_DAYS",
  "PH_PRIVACY_PURGE_TIMEOUT_MINUTES",
  "PH_ATTACHMENT_STORAGE",
  "PH_ATTACHMENT_S3_ENDPOINT",
  "PH_ATTACHMENT_S3_REGION",
  "PH_ATTACHMENT_S3_BUCKET",
  "PH_ATTACHMENT_S3_ACCESS_KEY_ID",
  "PH_ATTACHMENT_S3_SECRET_ACCESS_KEY",
  "PH_ATTACHMENT_URL_SIGNING_SECRET",
  "ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS",
  "PH_SWITCHBOARD_PUBLIC_URL",
  "PH_SWITCHBOARD_PORT",
  "PH_MIGRATE_PGLITE",
  "PH_FORCE_PG_VERSION",
  "PH_DEFAULT_DRIVE_TYPE",
  "NODE_ENV",
];

const SECRET = "s".repeat(32);
const CORES = 8;

const ROWS: Record<string, Env> = {
  empty: {},
  "a typical dev setup": {
    LOG_LEVEL: "debug",
    PORT: "4002",
    BASE_PATH: "/sb",
    PH_USER_DATA_DIR: "/home/dev/.local/share/connect",
    PH_PGLITE_WORKERS: "false",
    PH_PGLITE_FSYNC: "0",
    MCP_ENABLED: "false",
    PH_WORKFLOWS_ENABLED: "1",
    DYNAMIC_MODEL_LOADING: "true",
    PH_REGISTRY_URL: "http://localhost:8080",
    PH_REGISTRY_PACKAGES: "@acme/a, @acme/b",
    FEATURE_PLUGIN_HOST_ENABLED: "1",
    PH_CATCH_UP_PRIORITY: "3",
  },
  "Postgres with workers": {
    PH_REACTOR_DATABASE_URL: "postgres://u:p@db:5432/reactor",
    DATABASE_URL: "postgres://u:p@db:5432/read",
    REACTOR_WORKERS: "auto",
    REACTOR_DB_POOL_SIZE_WORKER: "4",
    REACTOR_DB_ACQUIRE_TIMEOUT_MS: "2000",
    REACTOR_DB_POOL_SIZE_HOST: "32",
    REACTOR_PROJECTION_WORKER: "Yes",
    REACTOR_DB_POOL_SIZE_PROJECTION: "6",
    RENOWN_SOURCE: "remote",
    MAX_SKIP_THRESHOLD: "50",
    REACTOR_LEGACY_PROCESSOR_IDS: "false",
    REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "read-only",
  },
  "auth on": {
    AUTH_ENABLED: "true",
    ADMINS: "0xABC,0xdef",
    DEFAULT_PROTECTION: "TRUE",
    DOCUMENT_PERMISSIONS_ENABLED: "true",
    DOCUMENT_PERMISSION_CACHE_TTL_MS: "1000",
    REQUIRE_AUTHENTICATED_CALLER: "true",
    REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS: "/health, ,/ready ",
    RENOWN_SOURCE: "self",
    RENOWN_URL: " https://renown.example ",
    CREDENTIAL_VERIFICATION_CACHE_TTL_MS: "500",
    WS_CREDENTIAL_RECHECK_INTERVAL_MS: "0",
    REACTOR_DOCUMENT_DECISIONS: "true",
    REACTOR_AUTH_ENFORCEMENT: "true",
    CREATE_SIGNATURE_POLICY: " legacy ",
    PH_PRIVACY_ENABLED: "true",
    PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
    PH_PRIVACY_DEADLINE_DAYS: "2",
    PH_PRIVACY_PURGE_TIMEOUT_MINUTES: "5",
  },
  "inspection admin": {
    INSPECTION_ENABLED: "true",
    INSPECTION_ADMIN_ENABLED: "true",
    PH_INSPECTION_CALLS_PER_MINUTE: "120",
  },
  "inspection off, legacy storage chain": {
    INSPECTION_ENABLED: "false",
    PH_SWITCHBOARD_DATABASE_URL: "postgres://u:p@db/sb",
    PH_PGLITE_IN_MEMORY: "1",
    PH_PGLITE_WORKER_MEMORY_MB: "512",
    PH_PGLITE_VACUUM_FULL: " Forced",
    PH_PGLITE_VACUUM_FULL_ABOVE_MB: "64",
    PH_PGLITE_VACUUM_FULL_QUIET_MS: "nope",
    DOCUMENT_MODEL_SUBGRAPHS_ENABLED: "false",
    PH_WORKFLOWS_ENABLED: "TRUE",
  },
  "attachments on S3": {
    PH_ATTACHMENT_STORAGE: "s3",
    PH_ATTACHMENT_S3_ENDPOINT: "https://s3.example.com/",
    PH_ATTACHMENT_S3_REGION: "eu-west-1",
    PH_ATTACHMENT_S3_BUCKET: "docs",
    PH_ATTACHMENT_S3_ACCESS_KEY_ID: "id",
    PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: "key",
    PH_ATTACHMENT_URL_SIGNING_SECRET: SECRET,
    ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS: "60",
    PH_SWITCHBOARD_PUBLIC_URL: "https://sb.example",
    PUBLIC_URL: "",
    HEROKU_APP_DEFAULT_DOMAIN_NAME: "sb.herokuapp.com",
    NODE_ENV: "production",
  },
  "blank values": {
    DATABASE_URL: "",
    PH_SWITCHBOARD_DATABASE_URL: "postgres://u:p@db/sb",
    PH_USER_DATA_DIR: "",
    PORT: "",
    LOG_LEVEL: "",
    RENOWN_SOURCE: " ",
    REACTOR_WORKERS: " ",
    MCP_ENABLED: "",
    PH_REGISTRY_URL: "",
  },
};

const silent = { warn: () => undefined } as unknown as ILogger;

function stubRow(row: Env): void {
  for (const key of KEYS) vi.stubEnv(key, row[key]);
}

function mapped(row: Env): SwitchboardConfig {
  return switchboardConfigSchema.parse(
    switchboardConfigFromEnv(row, { logger: silent }),
  );
}

describe("switchboardConfigFromEnv matches today's env reads", () => {
  let featureFlags: BooleanFlagSource;

  beforeAll(async () => {
    featureFlags = await initFeatureFlags();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe.each(Object.entries(ROWS))("%s", (_name, row) => {
    it("server and storage", () => {
      stubRow(row);
      const config = mapped(row);
      expect(config.logLevel).toBe(row.LOG_LEVEL || "info");
      expect(config.server.port).toBe(row.PORT ? Number(row.PORT) : 4001);
      expect(config.server.basePath).toBe(row.BASE_PATH || "/");
      expect(config.storage.reactor.url).toBe(
        reactorDbUrlOf(undefined, row) || undefined,
      );
      expect(config.storage.readModel.url).toBe(
        (row.DATABASE_URL ?? row.PH_SWITCHBOARD_DATABASE_URL) || undefined,
      );
      expect(config.storage.inMemory).toBe(row.PH_PGLITE_IN_MEMORY === "1");
      expect(
        defaultStoreDirs({ PH_USER_DATA_DIR: config.storage.userDataDir }),
      ).toEqual(defaultStoreDirs(row));
      expect(config.storage.pglite.fsync).toBe(resolvePgliteFsync(row));
      expect(
        config.storage.pglite.workerMemoryMb ?? resolvePgliteWorkerMemoryMb({}),
      ).toBe(resolvePgliteWorkerMemoryMb(row));
      const vacuum = config.storage.pglite.vacuumFull;
      expect(
        resolvePgliteMaintenance({
          PH_PGLITE_VACUUM_FULL: vacuum.mode,
          PH_PGLITE_VACUUM_FULL_ABOVE_MB: vacuum.aboveMb?.toString(),
          PH_PGLITE_VACUUM_FULL_QUIET_MS: vacuum.quietMs?.toString(),
          PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS: vacuum.maxDeferMs?.toString(),
        }),
      ).toEqual(resolvePgliteMaintenance(row));
    });

    it("feature switches, as the OpenFeature client reads them", async () => {
      stubRow(row);
      const config = mapped(row);
      await expect(
        featureFlags.getBooleanValue("PH_PGLITE_WORKERS", true),
      ).resolves.toBe(config.storage.pglite.workers);
      await expect(
        featureFlags.getBooleanValue("INSPECTION_ENABLED", true),
      ).resolves.toBe(config.inspection.enabled);
      await expect(
        featureFlags.getBooleanValue("MCP_ENABLED", true),
      ).resolves.toBe(config.features.mcp ?? true);
      await expect(workflowsBefore(featureFlags, row)).resolves.toBe(
        config.features.workflows ?? false,
      );
      await expect(
        featureFlags.getBooleanValue("DOCUMENT_MODEL_SUBGRAPHS_ENABLED", true),
      ).resolves.toBe(config.features.documentModelSubgraphs);
      expect(config.features.pluginHost).toBe(isPluginHostEnabled(row));
    });

    it("protocol", () => {
      const { protocol } = mapped(row);
      expect(protocol.featureFlags).toEqual(
        resolveReactorFeatureFlags(row).flags,
      );
      for (const hasSigner of [true, false]) {
        expect(
          resolveCreateSignaturePolicy(
            { CREATE_SIGNATURE_POLICY: protocol.createSignaturePolicy },
            { hasSigner },
          ),
        ).toBe(resolveCreateSignaturePolicy(row, { hasSigner }));
      }
      expect(protocol.unsupportedStoredDocuments).toBe(
        resolveUnsupportedStoredDocuments(undefined, row),
      );
      expect(protocol.legacyProcessorIds).toBe(
        row.REACTOR_LEGACY_PROCESSOR_IDS !== "false",
      );
      const skip = parseInt(row.MAX_SKIP_THRESHOLD ?? "", 10);
      expect(protocol.maxSkipThreshold).toBe(
        !isNaN(skip) && skip > 0 ? skip : undefined,
      );
      const priority = parseCatchUpPriority(row.PH_CATCH_UP_PRIORITY) ?? {
        mode: "dynamic",
      };
      expect(protocol.catchUpPriority).toBe(
        priority.mode === "fixed" ? priority.level : "dynamic",
      );
    });

    it("workers", () => {
      const { workers } = mapped(row);
      expect(
        resolveWorkerPoolOptions(
          {
            numWorkers: workers.executor.count,
            dbPoolSizePerWorker: workers.executor.poolSize,
            acquireTimeoutMs: workers.executor.acquireTimeoutMs,
          },
          {},
          CORES,
        ),
      ).toEqual(resolveWorkerPoolOptions(undefined, row, CORES));
      expect(workers.hostPoolSize).toBe(resolveHostPoolSize(row));
      expect(
        resolveProjectionWorkerOptions(
          {
            enabled: workers.projection.enabled,
            dbPoolSize: workers.projection.poolSize,
          },
          {},
        ),
      ).toEqual(resolveProjectionWorkerOptions(undefined, row));
    });

    it("inspection, packages, privacy and attachments", () => {
      const config = mapped(row);
      expect(config.inspection.admin).toBe(
        row.INSPECTION_ADMIN_ENABLED === "true",
      );
      expect(config.inspection.callsPerMinute).toBe(
        inspectionThrottleFromEnv(row).callsPerMinute,
      );
      expect(config.packages.registryUrl).toBe(row.PH_REGISTRY_URL);
      expect(config.packages.registryPackages).toEqual(
        row.PH_REGISTRY_PACKAGES?.split(",").map((p) => p.trim()) ?? [],
      );
      expect(config.packages.dynamic).toBe(
        row.DYNAMIC_MODEL_LOADING === "true",
      );
      const privacy = config.features.privacy;
      expect(
        privacy.enabled
          ? {
              enabled: true,
              deploymentSecret: privacy.deploymentSecret,
              intervalMs: privacy.intervalMs,
              deadlineMs: privacy.deadlineMs,
              markerGraceMs: privacy.markerGraceMs,
              purgeTimeoutMs: privacy.purgeTimeoutMs,
            }
          : { enabled: false },
      ).toEqual(resolvePrivacy(undefined, row));
      expect(config.attachments.storage).toEqual(
        parseAttachmentStorageConfig(row),
      );
      expect(
        resolveAttachmentUrlSigning({
          PH_ATTACHMENT_URL_SIGNING_SECRET: config.attachments.urlSigningSecret,
          NODE_ENV: row.NODE_ENV,
        }).status,
      ).toBe(resolveAttachmentUrlSigning(row).status);
      expect(config.attachments.serviceUrl).toBe(row.PH_SWITCHBOARD_PUBLIC_URL);
      expect(config.attachments.downloadTargetMaxTtlSeconds).toBe(
        row.ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS === undefined
          ? undefined
          : Number(row.ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS),
      );
    });

    it("renown", () => {
      const { auth } = mapped(row);
      const today = resolveRenownConfig(undefined, row, silent);
      expect({
        source: auth.renown.source ?? "remote",
        url: auth.renown.url,
        switchboardUrl: auth.renown.switchboardUrl,
      }).toEqual(today);
      expect(
        auth.credentialCacheTtlMs ?? (today.source === "self" ? 0 : undefined),
      ).toBe(
        resolveCredentialCacheTtlMs(
          row.CREDENTIAL_VERIFICATION_CACHE_TTL_MS,
          today.source,
          silent,
        ),
      );
    });
  });

  it.each(Object.entries(ROWS))(
    "takes the reactor-api sections from reactorApiConfigFromEnv: %s",
    (_name, row) => {
      const layer = switchboardConfigFromEnv(row, { logger: silent });
      const api = reactorApiConfigFromEnv(row, silent);
      const { renown: _renown, ...auth } = layer.auth ?? {};
      expect(Object.keys(auth).length > 0 ? auth : undefined).toEqual(api.auth);
      expect(layer.inspection?.admin).toBe(api.inspection?.admin);
      expect(layer.attachments?.storage).toEqual(api.attachments?.storage);
      const { port: _port, ...server } = layer.server ?? {};
      expect(Object.keys(server).length > 0 ? server : undefined).toEqual(
        api.server,
      );
    },
  );

  it("names only the keys the env sets", () => {
    expect(switchboardConfigFromEnv({}, { logger: silent })).toEqual({});
    expect(
      switchboardConfigFromEnv(
        { REACTOR_AUTH_GROUPS: "true", PH_PGLITE_VACUUM_FULL: "quiet" },
        { logger: silent },
      ),
    ).toStrictEqual({
      storage: { pglite: { vacuumFull: { mode: "quiet" } } },
      protocol: { featureFlags: { authGroups: true } },
    });
  });
});

describe("switchboardConfigFromEnv errors", () => {
  const messageOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("expected today's read to throw");
  };

  const POSTGRES = "postgres://u:p@db/reactor";

  it.each<[string, Env, () => unknown]>([
    [
      "REACTOR_WORKERS",
      { REACTOR_WORKERS: "two" },
      () => resolveWorkerPoolOptions(undefined, { REACTOR_WORKERS: "two" }),
    ],
    [
      "REACTOR_DB_POOL_SIZE_WORKER with workers on",
      { REACTOR_WORKERS: "2", REACTOR_DB_POOL_SIZE_WORKER: "-1" },
      () =>
        resolveWorkerPoolOptions(undefined, {
          REACTOR_WORKERS: "2",
          REACTOR_DB_POOL_SIZE_WORKER: "-1",
        }),
    ],
    [
      "REACTOR_DB_POOL_SIZE_HOST with a Postgres reactor",
      { PH_REACTOR_DATABASE_URL: POSTGRES, REACTOR_DB_POOL_SIZE_HOST: "0" },
      () => resolveHostPoolSize({ REACTOR_DB_POOL_SIZE_HOST: "0" }),
    ],
    [
      "REACTOR_PROJECTION_WORKER",
      { REACTOR_PROJECTION_WORKER: "maybe" },
      () =>
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: "maybe",
        }),
    ],
    [
      "REACTOR_DB_POOL_SIZE_PROJECTION with the projection worker on",
      { REACTOR_PROJECTION_WORKER: "1", REACTOR_DB_POOL_SIZE_PROJECTION: "0" },
      () =>
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_PROJECTION_WORKER: "1",
          REACTOR_DB_POOL_SIZE_PROJECTION: "0",
        }),
    ],
    [
      "PH_PRIVACY_INTERVAL_MS with privacy on",
      {
        PH_PRIVACY_ENABLED: "true",
        PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
        PH_PRIVACY_INTERVAL_MS: "-5",
      },
      () =>
        resolvePrivacy(undefined, {
          PH_PRIVACY_ENABLED: "true",
          PH_PRIVACY_DEPLOYMENT_SECRET: SECRET,
          PH_PRIVACY_INTERVAL_MS: "-5",
        }),
    ],
    [
      "PH_PGLITE_VACUUM_FULL",
      { PH_PGLITE_VACUUM_FULL: "sometimes" },
      () => resolvePgliteMaintenance({ PH_PGLITE_VACUUM_FULL: "sometimes" }),
    ],
    [
      "PH_PGLITE_WORKER_MEMORY_MB",
      { PH_PGLITE_WORKER_MEMORY_MB: "0" },
      () => resolvePgliteWorkerMemoryMb({ PH_PGLITE_WORKER_MEMORY_MB: "0" }),
    ],
    [
      "CREATE_SIGNATURE_POLICY",
      { CREATE_SIGNATURE_POLICY: "v3" },
      () =>
        resolveCreateSignaturePolicy(
          { CREATE_SIGNATURE_POLICY: "v3" },
          { hasSigner: true },
        ),
    ],
    [
      "REACTOR_UNSUPPORTED_STORED_DOCUMENTS",
      { REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "ignore" },
      () =>
        resolveUnsupportedStoredDocuments(undefined, {
          REACTOR_UNSUPPORTED_STORED_DOCUMENTS: "ignore",
        }),
    ],
    [
      "PH_INSPECTION_CALLS_PER_MINUTE",
      { PH_INSPECTION_CALLS_PER_MINUTE: "0" },
      () => inspectionThrottleFromEnv({ PH_INSPECTION_CALLS_PER_MINUTE: "0" }),
    ],
    [
      "PH_ATTACHMENT_STORAGE",
      { PH_ATTACHMENT_STORAGE: "gcs" },
      () => parseAttachmentStorageConfig({ PH_ATTACHMENT_STORAGE: "gcs" }),
    ],
    [
      "PH_ATTACHMENT_URL_SIGNING_SECRET",
      { PH_ATTACHMENT_URL_SIGNING_SECRET: "short" },
      () =>
        resolveAttachmentUrlSigning({
          PH_ATTACHMENT_URL_SIGNING_SECRET: "short",
        }),
    ],
  ])("%s throws today's message", (_name, env, today) => {
    expect(() =>
      switchboardConfigFromEnv(env, { logger: silent }),
    ).toThrowError(messageOf(today));
  });

  it.each<[string, Env, () => unknown]>([
    [
      "REACTOR_DB_POOL_SIZE_WORKER without workers",
      { REACTOR_DB_POOL_SIZE_WORKER: "-1" },
      () =>
        resolveWorkerPoolOptions(undefined, {
          REACTOR_DB_POOL_SIZE_WORKER: "-1",
        }),
    ],
    [
      "REACTOR_DB_POOL_SIZE_PROJECTION without the projection worker",
      { REACTOR_DB_POOL_SIZE_PROJECTION: "0" },
      () =>
        resolveProjectionWorkerOptions(undefined, {
          REACTOR_DB_POOL_SIZE_PROJECTION: "0",
        }),
    ],
    [
      "PH_PRIVACY_INTERVAL_MS without privacy",
      { PH_PRIVACY_INTERVAL_MS: "-5" },
      () => resolvePrivacy(undefined, { PH_PRIVACY_INTERVAL_MS: "-5" }),
    ],
    [
      "REACTOR_DB_POOL_SIZE_HOST without a Postgres reactor",
      { REACTOR_DB_POOL_SIZE_HOST: "0" },
      () => undefined,
    ],
    [
      "PH_PGLITE_WORKER_MEMORY_MB with PGlite workers off",
      { PH_PGLITE_WORKERS: "false", PH_PGLITE_WORKER_MEMORY_MB: "0" },
      () => undefined,
    ],
  ])("%s does not throw, as today", (_name, env, today) => {
    expect(today).not.toThrow();
    expect(() =>
      switchboardConfigFromEnv(env, { logger: silent }),
    ).not.toThrow();
  });
});

describe("switchboardConfigFromEnv warnings", () => {
  it.each<
    [
      string,
      Env,
      (layer: ReturnType<typeof switchboardConfigFromEnv>) => unknown,
    ]
  >([
    [
      "PH_CATCH_UP_PRIORITY",
      { PH_CATCH_UP_PRIORITY: "fast" },
      (l) => l.protocol,
    ],
    ["GATEWAY_ADAPTER", { GATEWAY_ADAPTER: "nginx" }, (l) => l.server],
    ["LOG_LEVEL", { LOG_LEVEL: "INFO" }, (l) => l.logLevel],
    ["PORT", { PORT: "http" }, (l) => l.server],
    [
      "CREDENTIAL_VERIFICATION_CACHE_TTL_MS",
      { CREDENTIAL_VERIFICATION_CACHE_TTL_MS: "-1" },
      (l) => l.auth,
    ],
    [
      "ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS",
      { ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS: "0" },
      (l) => l.attachments,
    ],
  ])("an invalid %s warns and is left unset", (name, env, section) => {
    const warn = vi.fn();
    const layer = switchboardConfigFromEnv(env, {
      logger: { warn } as unknown as ILogger,
    });
    expect(section(layer)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain(name);
  });

  it("an invalid RENOWN_SOURCE warns and still overrides the config file, as remote", () => {
    const warn = vi.fn();
    const layer = switchboardConfigFromEnv(
      { RENOWN_SOURCE: "both" },
      { logger: { warn } as unknown as ILogger },
    );
    expect(layer.auth?.renown).toEqual({ source: "remote" });
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("switchboardConfigFromEnv for the bin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // What sb/config.ts gave for each row, before the bin moved to the config.
  const binRows: [
    Env,
    { port: number; migrate: boolean; pg?: 16 | 17; drive?: string },
  ][] = [
    [{}, { port: 4001, migrate: false }],
    [{ PORT: "5000" }, { port: 4001, migrate: false }],
    [
      { PH_SWITCHBOARD_PORT: "4100", PORT: "5000" },
      { port: 4100, migrate: false },
    ],
    [{ PH_SWITCHBOARD_PORT: "abc" }, { port: 4001, migrate: false }],
    [{ PH_SWITCHBOARD_PORT: " " }, { port: 0, migrate: false }],
    [
      {
        PH_MIGRATE_PGLITE: "true",
        PH_FORCE_PG_VERSION: "16",
        PH_DEFAULT_DRIVE_TYPE: "powerhouse/reactor-drive",
      },
      { port: 4001, migrate: true, pg: 16, drive: "powerhouse/reactor-drive" },
    ],
  ];

  it.each(binRows)("matches sb/config.ts for %o", (row, before) => {
    const config = switchboardConfigSchema.parse(
      switchboardConfigFromEnv(row, { bin: true, logger: silent }),
    );
    expect(config.server.port).toBe(before.port);
    expect(config.storage.migratePglite).toBe(before.migrate);
    expect(config.storage.forcePgVersion).toBe(before.pg);
    expect(config.drive?.documentType).toBe(before.drive);
  });

  it("puts the config file's port under PH_SWITCHBOARD_PORT", () => {
    const at = (env: Env) =>
      switchboardConfigSchema.parse(
        binSwitchboardConfig(env, {
          filePort: 4200,
          migratePglite: false,
          logger: silent,
        }),
      ).server.port;
    expect(at({})).toBe(4200);
    expect(at({ PH_SWITCHBOARD_PORT: "abc" })).toBe(4200);
    expect(at({ PH_SWITCHBOARD_PORT: "4100" })).toBe(4100);
  });

  it("keeps the bin's mcp, drive and --migrate-pglite over the env", () => {
    const config = switchboardConfigSchema.parse(
      binSwitchboardConfig(
        {
          MCP_ENABLED: "false",
          PH_DEFAULT_DRIVE_TYPE: "powerhouse/reactor-drive",
        },
        { migratePglite: true, logger: silent },
      ),
    );
    expect(config.features.mcp).toBe(false);
    expect(config.storage.migratePglite).toBe(true);
    expect(config.drive).toMatchObject({
      id: "powerhouse",
      slug: "powerhouse",
      documentType: "powerhouse/reactor-drive",
      global: { name: "Powerhouse" },
    });
    expect(
      switchboardConfigSchema.parse(
        binSwitchboardConfig({}, { migratePglite: false, logger: silent }),
      ).features.mcp,
    ).toBe(true);
  });

  it("throws the bin's errors only for the bin", () => {
    const env = { PH_FORCE_PG_VERSION: "15", PH_DEFAULT_DRIVE_TYPE: "x" };
    expect(() =>
      switchboardConfigFromEnv(env, { bin: true, logger: silent }),
    ).toThrowError("PH_FORCE_PG_VERSION must be one of: 16, 17 (got: 15)");
    expect(() =>
      switchboardConfigFromEnv(
        { PH_DEFAULT_DRIVE_TYPE: "x" },
        { bin: true, logger: silent },
      ),
    ).toThrowError("Invalid PH_DEFAULT_DRIVE_TYPE: x.");
    expect(switchboardConfigFromEnv(env, { logger: silent })).toEqual({});
  });
});

describe("PH_KEYFRAMES", () => {
  it("leaves keyframes unset without it", () => {
    expect(switchboardConfigFromEnv({}).storage?.keyframes).toBeUndefined();
    expect(
      switchboardConfigFromEnv({ PH_KEYFRAMES: "  " }).storage?.keyframes,
    ).toBeUndefined();
  });

  it("reads the rules", () => {
    const rules = {
      default: { interval: 10, keep: 4 },
      types: { "a/b": { interval: 50, keep: 1 }, "a/c": { keep: null } },
    };

    const config = switchboardConfigFromEnv({
      PH_KEYFRAMES: JSON.stringify(rules),
    });

    expect(config.storage?.keyframes).toEqual(rules);
    expect(switchboardConfigSchema.parse(config).storage.keyframes).toEqual(
      rules,
    );
  });

  it("stops the boot on JSON it cannot read", () => {
    expect(() =>
      switchboardConfigFromEnv({ PH_KEYFRAMES: "{keep:1}" }),
    ).toThrow("PH_KEYFRAMES is not valid JSON");
  });

  it("stops the boot on a rule it cannot use", () => {
    expect(() =>
      switchboardConfigFromEnv({
        PH_KEYFRAMES: JSON.stringify({ default: { keep: 0 } }),
      }),
    ).toThrow("PH_KEYFRAMES.default.keep");
  });

  it("is replaced whole by a later layer", () => {
    const merged = mergeSwitchboardConfig(
      {
        storage: {
          keyframes: {
            default: { keep: 4 },
            types: { "a/b": { keep: 1 } },
          },
        },
      },
      { storage: { keyframes: { default: { keep: 2 } } } },
    );

    expect(merged.storage?.keyframes).toEqual({ default: { keep: 2 } });
  });
});
