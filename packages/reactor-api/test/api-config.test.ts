import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule, ILogger } from "document-model";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reactorApiConfigFromEnv,
  type ReactorApiConfig,
} from "../src/api-config.js";
import { ADMIN_USERS } from "../src/graphql/system/env/index.js";
import { initializeAndStartAPI } from "../src/server.js";
import { DEFAULT_PERMISSION_CACHE_TTL_MS } from "../src/services/permission-cache.js";

function recordingLogger(): ILogger & { warnings: string[] } {
  const warnings: string[] = [];
  const noop = () => {};
  const logger = {
    level: "info",
    warnings,
    verbose: noop,
    debug: noop,
    info: noop,
    warn: (message: string) => warnings.push(message),
    error: noop,
    errorHandler: noop,
    child: () => logger,
  } as unknown as ILogger & { warnings: string[] };
  return logger;
}

const s3Env = {
  PH_ATTACHMENT_STORAGE: "s3",
  PH_ATTACHMENT_S3_ENDPOINT: "https://s3.example.com",
  PH_ATTACHMENT_S3_REGION: "eu-west-1",
  PH_ATTACHMENT_S3_BUCKET: "bucket",
  PH_ATTACHMENT_S3_ACCESS_KEY_ID: "key",
  PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: "secret",
};

// Each row is what the server read from process.env before this mapping existed.
const rows: Array<[string, Record<string, string>, ReactorApiConfig]> = [
  ["nothing set", {}, {}],
  [
    "BASE_PATH",
    { BASE_PATH: "/reactor" },
    { server: { basePath: "/reactor" } },
  ],
  ["empty BASE_PATH is unset", { BASE_PATH: "" }, {}],
  [
    "GATEWAY_ADAPTER",
    { GATEWAY_ADAPTER: "stitching" },
    { server: { gatewayAdapter: "stitching" } },
  ],
  [
    "PUBLIC_URL",
    { PUBLIC_URL: "https://a.example" },
    { server: { publicUrl: "https://a.example" } },
  ],
  [
    "PUBLIC_URL over RENDER_EXTERNAL_URL",
    { PUBLIC_URL: "a.example", RENDER_EXTERNAL_URL: "b.example" },
    { server: { publicUrl: "a.example" } },
  ],
  [
    "RENDER_EXTERNAL_URL",
    { RENDER_EXTERNAL_URL: "b.example" },
    { server: { publicUrl: "b.example" } },
  ],
  [
    "empty PUBLIC_URL skips RENDER_EXTERNAL_URL for the Heroku domain",
    {
      PUBLIC_URL: "",
      RENDER_EXTERNAL_URL: "b.example",
      HEROKU_APP_DEFAULT_DOMAIN_NAME: "c.example",
    },
    { server: { publicUrl: "c.example" } },
  ],
  ["AUTH_ENABLED=true", { AUTH_ENABLED: "true" }, { auth: { enabled: true } }],
  [
    "AUTH_ENABLED is exact",
    { AUTH_ENABLED: "TRUE" },
    { auth: { enabled: false } },
  ],
  [
    "ADMINS lowercases without trimming",
    { ADMINS: "0xAB, 0xCd" },
    { auth: { admins: ["0xab", " 0xcd"] } },
  ],
  ["empty ADMINS", { ADMINS: "" }, { auth: { admins: [""] } }],
  [
    "RESOLVE_CALLER_IDENTITY",
    { RESOLVE_CALLER_IDENTITY: "false" },
    { auth: { resolveIdentity: false } },
  ],
  [
    "REQUIRE_AUTHENTICATED_CALLER",
    { REQUIRE_AUTHENTICATED_CALLER: "true" },
    { auth: { requireAuthenticatedCaller: true } },
  ],
  [
    "REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS drops blanks",
    { REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS: " /a ,,/b," },
    { auth: { requireAuthenticatedCallerExemptPaths: ["/a", "/b"] } },
  ],
  [
    "ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY",
    { ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY: "true" },
    { auth: { attachmentReadsFollowDocumentPolicy: true } },
  ],
  [
    "DEFAULT_PROTECTION is case-insensitive",
    { DEFAULT_PROTECTION: "TRUE" },
    { auth: { defaultProtection: true } },
  ],
  [
    "DOCUMENT_PERMISSIONS_ENABLED",
    { DOCUMENT_PERMISSIONS_ENABLED: "true" },
    { auth: { documentPermissions: { enabled: true } } },
  ],
  [
    "DOCUMENT_PERMISSION_CACHE_TTL_MS",
    { DOCUMENT_PERMISSION_CACHE_TTL_MS: "5000" },
    { auth: { documentPermissions: { cacheTtlMs: 5000 } } },
  ],
  [
    "blank DOCUMENT_PERMISSION_CACHE_TTL_MS is unset",
    { DOCUMENT_PERMISSION_CACHE_TTL_MS: " " },
    {},
  ],
  [
    "SKIP_CREDENTIAL_VERIFICATION",
    { SKIP_CREDENTIAL_VERIFICATION: "true" },
    { auth: { skipCredentialVerification: true } },
  ],
  [
    "CREDENTIAL_VERIFICATION_CACHE_TTL_MS",
    { CREDENTIAL_VERIFICATION_CACHE_TTL_MS: "0" },
    { auth: { credentialCacheTtlMs: 0 } },
  ],
  [
    "WS_CREDENTIAL_RECHECK_INTERVAL_MS",
    { WS_CREDENTIAL_RECHECK_INTERVAL_MS: "250" },
    { auth: { wsRecheckMs: 250 } },
  ],
  [
    "INSPECTION_ADMIN_ENABLED",
    { INSPECTION_ADMIN_ENABLED: "true" },
    { inspection: { admin: true } },
  ],
  [
    "PH_ATTACHMENT_STORAGE=filesystem",
    { PH_ATTACHMENT_STORAGE: "filesystem" },
    { attachments: { storage: { kind: "filesystem" } } },
  ],
  [
    "PH_ATTACHMENT_STORAGE=s3",
    s3Env,
    {
      attachments: {
        storage: {
          kind: "s3",
          s3: {
            endpoint: "https://s3.example.com",
            region: "eu-west-1",
            bucket: "bucket",
            accessKeyId: "key",
            secretAccessKey: "secret",
            prefix: "attachments",
            forcePathStyle: false,
            uploadTtlSeconds: 900,
            downloadTtlSeconds: 300,
          },
        },
      },
    },
  ],
];

describe("reactorApiConfigFromEnv", () => {
  it.each(rows)("%s", (_name, env, expected) => {
    const logger = recordingLogger();
    expect(reactorApiConfigFromEnv(env, logger)).toEqual(expected);
    expect(logger.warnings).toEqual([]);
  });

  it.each([
    ["GATEWAY_ADAPTER", "graphql-mesh", {}],
    ["DOCUMENT_PERMISSION_CACHE_TTL_MS", "soon", {}],
    ["DOCUMENT_PERMISSION_CACHE_TTL_MS", "-5", {}],
    ["CREDENTIAL_VERIFICATION_CACHE_TTL_MS", "-1", {}],
    ["WS_CREDENTIAL_RECHECK_INTERVAL_MS", "often", {}],
    ["WS_CREDENTIAL_RECHECK_INTERVAL_MS", " ", {}],
  ])(
    "warns on an invalid %s=%j and leaves it unset",
    (key, value, expected) => {
      const logger = recordingLogger();
      expect(reactorApiConfigFromEnv({ [key]: value }, logger)).toEqual(
        expected,
      );
      expect(logger.warnings).toHaveLength(1);
      expect(logger.warnings[0]).toContain(key);
    },
  );

  it("throws on an invalid attachment storage, as the boot did", () => {
    expect(() =>
      reactorApiConfigFromEnv({ PH_ATTACHMENT_STORAGE: "ftp" }),
    ).toThrow("PH_ATTACHMENT_STORAGE must be either filesystem or s3");
    expect(() =>
      reactorApiConfigFromEnv({
        ...s3Env,
        PH_ATTACHMENT_S3_BUCKET: undefined,
      } as Record<string, string | undefined>),
    ).toThrow(/PH_ATTACHMENT_S3_BUCKET/);
  });
});

describe("ADMIN_USERS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the env on access, not at import", () => {
    vi.stubEnv("ADMIN_USERS", " 0xAA ,0xbb");
    expect([...ADMIN_USERS]).toEqual(["0xaa", "0xbb"]);
    expect(ADMIN_USERS.length).toBe(2);
    expect(Array.isArray(ADMIN_USERS)).toBe(true);
    vi.stubEnv("ADMIN_USERS", undefined);
    expect([...ADMIN_USERS]).toEqual([]);
  });
});

const initializeClient = async (documentModels: DocumentModelModule[]) => {
  const builder = new ReactorBuilder()
    .withEventBus(new EventBus())
    .withDocumentModelSources(documentModels)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  const module = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .buildModule();
  return { module };
};

describe("server settings from options and env", () => {
  let dispose: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await dispose?.();
    dispose = undefined;
    vi.unstubAllEnvs();
  });

  async function boot(
    options: Partial<Parameters<typeof initializeAndStartAPI>[1]> = {},
  ) {
    const api = await initializeAndStartAPI(
      initializeClient,
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        verifyCredential: () => Promise.resolve(true),
        ...options,
      },
      "switchboard",
    );
    dispose = api.dispose;
    return api;
  }

  async function explorerStatus(port: number, prefix: string) {
    const response = await fetch(`http://localhost:${port}${prefix}/explorer`);
    await response.text();
    return response.status;
  }

  it("reads BASE_PATH when the server starts, not when the module loads", async () => {
    vi.stubEnv("BASE_PATH", "/from-env");
    const api = await boot();
    expect(await explorerStatus(api.port, "/from-env")).toBe(200);
  });

  it("prefers server.basePath over BASE_PATH", async () => {
    vi.stubEnv("BASE_PATH", "/from-env");
    const api = await boot({ server: { basePath: "/from-options" } });
    expect(await explorerStatus(api.port, "/from-options")).toBe(200);
    expect(await explorerStatus(api.port, "/from-env")).toBe(404);
  });

  it("keeps AUTH_ENABLED and ADMINS overriding auth options", async () => {
    vi.stubEnv("AUTH_ENABLED", "true");
    vi.stubEnv("ADMINS", "0xEnv");
    const api = await boot({ auth: { enabled: false, admins: ["0xoption"] } });
    expect(api.authorizationService.config.policy).toBe("ADMIN_ONLY");
    expect(api.authorizationService.config.admins).toEqual(["0xenv"]);
  });

  it("lets a set auth option win over the config file's", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reactor-api-auth-"));
    const configFile = join(dir, "powerhouse.config.json");
    writeFileSync(
      configFile,
      JSON.stringify({ auth: { enabled: false, admins: ["0xFile"] } }),
    );
    try {
      const fromOptions = await boot({
        configFile,
        auth: { enabled: true, admins: ["0xOption"] },
      });
      expect(fromOptions.authorizationService.config.policy).toBe("ADMIN_ONLY");
      expect(fromOptions.authorizationService.config.admins).toEqual([
        "0xoption",
      ]);
      await dispose?.();
      dispose = undefined;

      writeFileSync(
        configFile,
        JSON.stringify({ auth: { enabled: true, admins: ["0xFile"] } }),
      );
      const fromFile = await boot({ configFile });
      expect(fromFile.authorizationService.config.policy).toBe("ADMIN_ONLY");
      expect(fromFile.authorizationService.config.admins).toEqual(["0xfile"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("takes document permissions from options without env", async () => {
    const api = await boot({
      auth: {
        enabled: true,
        admins: [],
        defaultProtection: true,
        documentPermissions: { enabled: true },
      },
    });
    expect(api.authorizationService.config.policy).toBe("DOCUMENT_PERMISSIONS");
    expect(api.authorizationService.config.defaultProtection).toBe(true);
  });

  it("prefers documentPermissions.enabled over DOCUMENT_PERMISSIONS_ENABLED", async () => {
    vi.stubEnv("AUTH_ENABLED", "true");
    vi.stubEnv("DOCUMENT_PERMISSIONS_ENABLED", "true");
    const api = await boot({
      auth: { documentPermissions: { enabled: false } },
    });
    expect(api.authorizationService.config.policy).toBe("ADMIN_ONLY");
  });

  it("falls back to the default cache TTL for an invalid DOCUMENT_PERMISSION_CACHE_TTL_MS", async () => {
    vi.stubEnv("AUTH_ENABLED", "true");
    vi.stubEnv("DOCUMENT_PERMISSIONS_ENABLED", "true");
    vi.stubEnv("DOCUMENT_PERMISSION_CACHE_TTL_MS", "soon");
    const infos: string[] = [];
    const logger = recordingLogger();
    logger.info = (message: string) => void infos.push(message);
    await boot({ logger });
    expect(logger.warnings.some((w) => w.includes("soon"))).toBe(true);
    expect(infos.join("\n")).toContain(
      `cache TTL ${DEFAULT_PERMISSION_CACHE_TTL_MS} ms`,
    );
  });
});
