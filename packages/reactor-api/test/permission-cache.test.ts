import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import {
  DocumentPermissionSnapshot,
  PermissionCache,
  type PermissionCacheOptions,
  type PermissionSnapshotLoader,
} from "../src/services/permission-cache.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { openReactorPermissionStore } from "./utils/reactor-permission-store.js";

function emptySnapshot(documentId: string): DocumentPermissionSnapshot {
  return new DocumentPermissionSnapshot(
    documentId,
    false,
    null,
    new Map(),
    new Map(),
  );
}

class Clock {
  time = 1_000;
  readonly now = (): number => this.time;
}

describe("PermissionCache", () => {
  let clock: Clock;
  let loader: ReturnType<typeof vi.fn<PermissionSnapshotLoader>>;
  let options: PermissionCacheOptions;

  beforeEach(() => {
    clock = new Clock();
    loader = vi.fn<PermissionSnapshotLoader>((ids) =>
      Promise.resolve(new Map(ids.map((id) => [id, emptySnapshot(id)]))),
    );
    options = { ttlMs: 30_000, maxEntries: 100, now: clock.now };
  });

  it("loads on miss and serves the next read from memory", async () => {
    const cache = new PermissionCache(loader, options);

    const first = await cache.get("doc-1");
    const second = await cache.get("doc-1");

    expect(second).toBe(first);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(["doc-1"]);
  });

  it("loads only the missing documents of a batch, in one call", async () => {
    const cache = new PermissionCache(loader, options);
    await cache.get("doc-1");

    const snapshots = await cache.getMany(["doc-1", "doc-2", "doc-3", "doc-2"]);

    expect([...snapshots.keys()].sort()).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenLastCalledWith(["doc-2", "doc-3"]);
  });

  it("reloads an entry once its TTL has passed", async () => {
    const cache = new PermissionCache(loader, options);
    await cache.get("doc-1");

    clock.time += 29_999;
    await cache.get("doc-1");
    expect(loader).toHaveBeenCalledTimes(1);

    clock.time += 1;
    await cache.get("doc-1");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not cache at all with a TTL of 0", async () => {
    const cache = new PermissionCache(loader, { ...options, ttlMs: 0 });

    await cache.get("doc-1");
    await cache.get("doc-1");

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it("reloads after invalidate and after clear", async () => {
    const cache = new PermissionCache(loader, options);
    await cache.getMany(["doc-1", "doc-2"]);

    cache.invalidate("doc-1");
    await cache.getMany(["doc-1", "doc-2"]);
    expect(loader).toHaveBeenLastCalledWith(["doc-1"]);

    cache.clear();
    expect(cache.size).toBe(0);
    await cache.getMany(["doc-1", "doc-2"]);
    expect(loader).toHaveBeenLastCalledWith(["doc-1", "doc-2"]);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("does not store a load that overlapped an invalidation", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loader.mockImplementationOnce(async (ids) => {
      await gate;
      return new Map(ids.map((id) => [id, emptySnapshot(id)]));
    });
    const cache = new PermissionCache(loader, options);

    const pending = cache.get("doc-1");
    cache.invalidate("doc-1");
    release();
    await pending;

    expect(cache.size).toBe(0);
    await cache.get("doc-1");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("drops the least recently used entry past maxEntries", async () => {
    const cache = new PermissionCache(loader, { ...options, maxEntries: 2 });
    await cache.get("doc-1");
    await cache.get("doc-2");
    await cache.get("doc-1");

    await cache.get("doc-3");

    expect(cache.size).toBe(2);
    await cache.getMany(["doc-1", "doc-3"]);
    expect(loader).toHaveBeenCalledTimes(3);
    await cache.get("doc-2");
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("fails when the loader leaves a document out", async () => {
    const cache = new PermissionCache(
      () => Promise.resolve(new Map()),
      options,
    );

    await expect(cache.get("doc-1")).rejects.toThrow(
      "Permission snapshot loader returned no snapshot for doc-1",
    );
  });
});

describe("DocumentPermissionService through the permission cache (reactor store)", () => {
  const doc = "doc-1" as CanonicalDocumentId;
  const parent = "parent-1" as CanonicalDocumentId;
  let db: Kysely<DocumentPermissionDatabase>;
  let clock: Clock;
  let service: DocumentPermissionService;
  let authorization: IAuthorizationService;
  let parents: Record<string, string[]>;
  let loads: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    db = await openReactorPermissionStore();
    clock = new Clock();
    parents = {};
    service = new DocumentPermissionService(
      db,
      { defaultProtection: false },
      { ttlMs: 30_000, maxEntries: 100, now: clock.now },
    );
    loads = vi.spyOn(service, "loadPermissionSnapshots");
    authorization = createAuthorizationService(
      {
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      service,
      (documentId) => Promise.resolve(parents[documentId] ?? []),
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("answers repeated checks without going back to the store", async () => {
    await service.setDocumentProtection(doc, true);

    expect(await authorization.canRead(doc, "0xreader")).toBe(false);
    const afterFirst = loads.mock.calls.length;
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);
    expect(await authorization.canWrite(doc, "0xreader")).toBe(false);
    expect(await authorization.canManage(doc, "0xreader")).toBe(false);

    expect(loads.mock.calls.length).toBe(afterFirst);
  });

  it("sees its own grant and revoke on the next check", async () => {
    await service.setDocumentProtection(doc, true);
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);

    await service.grantPermission(doc, "0xReader", "READ", "0xowner");
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);
    expect(await authorization.canWrite(doc, "0xreader")).toBe(false);

    await service.revokePermission(doc, "0xreader");
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);
  });

  it("sees protection, ownership and operation grants on the next check", async () => {
    expect(await authorization.canWrite(doc, "0xuser")).toBe(true);

    await service.setDocumentProtection(doc, true);
    expect(await authorization.canWrite(doc, "0xuser")).toBe(false);

    await service.setDocumentOwner(doc, "0xUser");
    expect(await authorization.canManage(doc, "0xuser")).toBe(true);

    expect(await authorization.canMutate(doc, "SET_NAME", "0xother")).toBe(
      false,
    );
    await service.grantOperationPermission(
      doc,
      "SET_NAME",
      "0xOther",
      "0xuser",
    );
    expect(await authorization.canMutate(doc, "SET_NAME", "0xother")).toBe(
      true,
    );
    expect(await authorization.canMutate(doc, "SET_NAME", "0xthird")).toBe(
      false,
    );

    await service.revokeOperationPermission(doc, "SET_NAME", "0xother");
    expect(await authorization.canMutate(doc, "SET_NAME", "0xother")).toBe(
      false,
    );
  });

  it("sees an erasure on the next check", async () => {
    await service.initializeDocumentProtection(doc, "0xowner", true);
    await service.grantPermission(doc, "0xreader", "READ", "0xowner");
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);

    await service.deleteAllDocumentPermissions(doc);
    await service.deleteDocumentProtection(doc);

    expect(await service.getDocumentOwner(doc)).toBeNull();
    expect(await service.getUserPermission(doc, "0xreader")).toBeNull();
  });

  it("walks ancestors live while their rows come from the cache", async () => {
    await service.setDocumentProtection(parent, true);
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);

    parents[doc] = [parent];
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);

    await service.grantPermission(parent, "0xreader", "READ", "0xowner");
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);
  });

  it("serves a write made outside this process until the TTL, or until invalidated", async () => {
    await service.setDocumentProtection(doc, true);
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);

    await db
      .insertInto("DocumentPermission")
      .values({
        documentId: doc,
        userAddress: "0xreader",
        permission: "READ",
        grantedBy: "0xowner",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    expect(await authorization.canRead(doc, "0xreader")).toBe(false);
    clock.time += 30_000;
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);

    await db.deleteFrom("DocumentPermission").execute();
    expect(await authorization.canRead(doc, "0xreader")).toBe(true);
    service.permissionCache.invalidate(doc);
    expect(await authorization.canRead(doc, "0xreader")).toBe(false);
  });

  it("returns grant timestamps as written on the reactor store", async () => {
    const before = Date.now();
    const entry = await service.grantPermission(doc, "0xr", "READ", "0xo");
    const after = Date.now();

    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after);
  });
});
