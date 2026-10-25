// Where the host's own permission service keeps its tables: on the reactor
// store when the client initializer hands one over, on the read-model store
// (behind reactor-api's legacy migrations) when it does not.
import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "document-model";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeAndStartAPI,
  resolvePermissionCacheTtlMs,
  type ClientInitializerDependencies,
} from "../src/server.js";
import { DEFAULT_PERMISSION_CACHE_TTL_MS } from "../src/services/permission-cache.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { openReactorPermissionStore } from "./utils/reactor-permission-store.js";

async function buildModule(documentModels: DocumentModelModule[]) {
  const builder = new ReactorBuilder()
    .withEventBus(new EventBus())
    .withDocumentModelSources(documentModels)
    .withChannelScheme(ChannelScheme.SWITCHBOARD);
  return new ReactorClientBuilder().withReactorBuilder(builder).buildModule();
}

async function tableNames(db: Kysely<unknown>): Promise<string[]> {
  const result = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = current_schema()
      and table_name in ('DocumentPermission', 'OperationUserPermission', 'DocumentProtection')
    order by table_name
  `.execute(db);
  return result.rows.map((row) => row.table_name);
}

let dispose: (() => Promise<void>) | undefined;
let permissionsDb: Kysely<DocumentPermissionDatabase> | undefined;

beforeEach(() => {
  vi.stubEnv("AUTH_ENABLED", "true");
  vi.stubEnv("DOCUMENT_PERMISSIONS_ENABLED", "true");
});

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  await permissionsDb?.destroy();
  permissionsDb = undefined;
  vi.unstubAllEnvs();
});

describe("the host-built document permission service", () => {
  it("writes to the reactor store the client initializer hands over", async () => {
    const store = await openReactorPermissionStore();
    permissionsDb = store;
    let readModelDb: Kysely<unknown> | undefined;

    const api = await initializeAndStartAPI(
      async (documentModels, deps: ClientInitializerDependencies) => {
        readModelDb = deps.readModelDb;
        return {
          module: await buildModule(documentModels),
          permissionsDb: store,
        };
      },
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        verifyCredential: () => Promise.resolve(true),
      },
      "switchboard",
    );
    dispose = api.dispose;

    expect(api.authorizationService.config.policy).toBe("DOCUMENT_PERMISSIONS");
    await api.documentPermissionService!.grantPermission(
      "doc-1",
      "0xreader",
      "READ",
      "0xowner",
    );
    const rows = await store
      .selectFrom("DocumentPermission")
      .select(["documentId", "userAddress", "permission"])
      .execute();
    expect(rows).toEqual([
      { documentId: "doc-1", userAddress: "0xreader", permission: "READ" },
    ]);
    expect(readModelDb).toBeDefined();
    expect(await tableNames(readModelDb!)).toEqual([]);
  });

  it("keeps the legacy read-model tables when no reactor store is handed over", async () => {
    let readModelDb: Kysely<unknown> | undefined;

    const api = await initializeAndStartAPI(
      async (documentModels, deps: ClientInitializerDependencies) => {
        readModelDb = deps.readModelDb;
        return { module: await buildModule(documentModels) };
      },
      {
        port: 0,
        dbPath: undefined,
        mcp: false,
        verifyCredential: () => Promise.resolve(true),
      },
      "switchboard",
    );
    dispose = api.dispose;

    await api.documentPermissionService!.grantPermission(
      "doc-1",
      "0xreader",
      "READ",
      "0xowner",
    );
    expect(await tableNames(readModelDb!)).toEqual([
      "DocumentPermission",
      "DocumentProtection",
      "OperationUserPermission",
    ]);
  });
});

describe("resolvePermissionCacheTtlMs", () => {
  const logger = { warn: vi.fn() } as unknown as Parameters<
    typeof resolvePermissionCacheTtlMs
  >[1];

  it("defaults when unset or blank", () => {
    expect(resolvePermissionCacheTtlMs(undefined, logger)).toBe(
      DEFAULT_PERMISSION_CACHE_TTL_MS,
    );
    expect(resolvePermissionCacheTtlMs(" ", logger)).toBe(
      DEFAULT_PERMISSION_CACHE_TTL_MS,
    );
  });

  it("accepts a non-negative integer, 0 included", () => {
    expect(resolvePermissionCacheTtlMs("5000", logger)).toBe(5000);
    expect(resolvePermissionCacheTtlMs("0", logger)).toBe(0);
  });

  it("falls back to the default on anything else", () => {
    expect(resolvePermissionCacheTtlMs("-1", logger)).toBe(
      DEFAULT_PERMISSION_CACHE_TTL_MS,
    );
    expect(resolvePermissionCacheTtlMs("soon", logger)).toBe(
      DEFAULT_PERMISSION_CACHE_TTL_MS,
    );
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
