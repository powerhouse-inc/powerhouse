import type { DocumentChangeEvent, PagedResults } from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthorizationPolicy } from "../src/services/authorization.service.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import {
  applyReadableFilter,
  EVERYONE,
  ReadableDocumentsProjection,
  readableDocumentsSubquery,
} from "../src/services/readable-documents.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { openReactorPermissionStore } from "./utils/reactor-permission-store.js";

const ADMIN = "0xadmin";
const USER = "0xuser1";
const OWNER = "0xowner";
const DRIVE = "drive";
const DRIVE_TYPE = "powerhouse/reactor-drive";

/** A reactor read client over an in-memory document graph. */
function fakeReactor(initial: {
  documents: { id: string; type: string }[];
  edges: [parent: string, child: string][];
}) {
  const documents = new Map(initial.documents.map((d) => [d.id, d.type]));
  const edges = new Set(initial.edges.map(([p, c]) => `${p}>${c}`));
  const listeners: ((event: DocumentChangeEvent) => void)[] = [];
  const page = <T>(results: T[]): PagedResults<T> => ({
    results,
    options: { cursor: "0", limit: results.length },
  });
  const doc = (id: string) =>
    ({ header: { id, documentType: documents.get(id) } }) as never;
  return {
    read: {
      find: (search: { type?: string }) =>
        Promise.resolve(
          page(
            [...documents.entries()]
              .filter(([, type]) => !search.type || type === search.type)
              .map(([id]) => doc(id)),
          ),
        ),
      getOutgoingRelationshipEdges: (parent: string) =>
        Promise.resolve(
          page(
            [...edges]
              .filter((e) => e.startsWith(`${parent}>`))
              .map((e) => ({ sourceId: parent, targetId: e.split(">")[1] })),
          ),
        ) as never,
      subscribe: (_search: unknown, cb: (e: DocumentChangeEvent) => void) => {
        listeners.push(cb);
        return () => {
          listeners.splice(listeners.indexOf(cb), 1);
        };
      },
    },
    emit(event: DocumentChangeEvent) {
      for (const l of listeners) l(event);
    },
    doc,
  };
}

async function until(check: () => Promise<boolean>, ms = 2000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("condition not met in time");
}

describe("ReadableDocumentsProjection", () => {
  let db: Kysely<DocumentPermissionDatabase>;
  let relationalDb: IRelationalDb;
  let permissions: DocumentPermissionService;
  let reactor: ReturnType<typeof fakeReactor>;
  let projection: ReadableDocumentsProjection;

  const readable = async (user: string | undefined): Promise<string[]> => {
    const filter = projection.filterFor(user);
    if (filter.kind !== "ids") throw new Error(`filter is ${filter.kind}`);
    const rows = await readableDocumentsSubquery(filter).execute(
      relationalDb as unknown as Kysely<unknown>,
    );
    return (rows.rows as unknown as { document_id: string }[])
      .map((r) => r.document_id)
      .sort();
  };

  beforeEach(async () => {
    db = await openReactorPermissionStore();
    relationalDb = createRelationalDb(db as unknown as Kysely<unknown>);
    permissions = new DocumentPermissionService(db, {
      defaultProtection: false,
    });
    reactor = fakeReactor({
      documents: [
        { id: DRIVE, type: DRIVE_TYPE },
        { id: "a", type: "x/doc" },
        { id: "b", type: "x/doc" },
        { id: "orphan", type: "x/doc" },
      ],
      edges: [
        [DRIVE, "a"],
        [DRIVE, "b"],
      ],
    });
    projection = new ReadableDocumentsProjection({
      relationalDb,
      read: reactor.read as never,
      permissions,
      config: {
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        admins: [ADMIN],
        defaultProtection: false,
      },
      debounceMs: 5,
    });
    await projection.start();
  });

  afterEach(async () => {
    await projection.stop();
    await db.destroy();
  });

  it("lists everything for everyone while nothing is protected, and bypasses listed admins", async () => {
    expect(await readable(USER)).toEqual(["a", "b", "drive", "orphan"]);
    expect(await readable(undefined)).toEqual(["a", "b", "drive", "orphan"]);
    expect(projection.filterFor(ADMIN)).toEqual({ kind: "all" });
    expect(projection.filterFor(ADMIN.toUpperCase())).toEqual({ kind: "all" });
  });

  it("follows protection, ownership and inherited grants through the permission service", async () => {
    await permissions.setDocumentProtection(DRIVE, true);
    await permissions.setDocumentOwner(DRIVE, OWNER);
    await until(async () => !(await readable(USER)).includes("a"));
    // the drive and its children are protected; the orphan inherits nothing
    expect(await readable(USER)).toEqual(["orphan"]);
    expect(await readable(undefined)).toEqual(["orphan"]);
    // the owner reads the drive itself, not its children
    expect(await readable(OWNER)).toEqual(["drive", "orphan"]);

    await permissions.grantPermission(DRIVE, USER, "READ", ADMIN);
    await until(async () => (await readable(USER)).includes("a"));
    expect(await readable(USER)).toEqual(["a", "b", "drive", "orphan"]);

    await permissions.revokePermission(DRIVE, USER);
    await until(async () => !(await readable(USER)).includes("a"));
    expect(await readable(USER)).toEqual(["orphan"]);
  });

  it("follows document and relationship changes from the reactor", async () => {
    await permissions.setDocumentProtection(DRIVE, true);
    await permissions.setDocumentOwner(DRIVE, OWNER);
    await permissions.grantPermission(DRIVE, USER, "READ", ADMIN);
    // the protection has landed once the anonymous caller lost the drive's children
    await until(async () => !(await readable(undefined)).includes("a"));
    expect(await readable(USER)).toEqual(["a", "b", "drive", "orphan"]);

    // b leaves the drive: it inherits nothing and, unprotected itself, is public
    reactor.emit({
      type: DocumentChangeType.ChildRemoved,
      documents: [reactor.doc(DRIVE)],
      context: { parentId: DRIVE, childId: "b" },
    });
    await until(async () => (await readable(undefined)).includes("b"));
    expect(await readable(undefined)).toEqual(["b", "orphan"]);

    // a new document under the drive is protected with it
    reactor.emit({
      type: DocumentChangeType.Created,
      documents: [reactor.doc("c")],
    });
    reactor.emit({
      type: DocumentChangeType.ChildAdded,
      documents: [reactor.doc(DRIVE)],
      context: { parentId: DRIVE, childId: "c" },
    });
    await until(async () => (await readable(USER)).includes("c"));
    expect(await readable(undefined)).toEqual(["b", "orphan"]);
    expect(await readable(USER)).toEqual(["a", "b", "c", "drive", "orphan"]);

    // a deleted document leaves every row
    reactor.emit({
      type: DocumentChangeType.Deleted,
      documents: [reactor.doc("a")],
    });
    await until(async () => !(await readable(USER)).includes("a"));
    expect(await readable(USER)).toEqual(["b", "c", "drive", "orphan"]);
  });

  it("applies DEFAULT_PROTECTION to documents without a protection row", async () => {
    await projection.stop();
    projection = new ReadableDocumentsProjection({
      relationalDb,
      read: reactor.read as never,
      permissions: new DocumentPermissionService(db, {
        defaultProtection: true,
      }),
      config: {
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        admins: [ADMIN],
        defaultProtection: true,
      },
      debounceMs: 5,
    });
    await projection.start();
    expect(await readable(USER)).toEqual([]);
    expect(await readable(undefined)).toEqual([]);
  });

  it("filters an index table in another namespace with one subquery", async () => {
    const index = (await relationalDb.createNamespace(
      "key_index_drive",
    )) as unknown as Kysely<{
      key_index: { document_id: string; key: string };
    }>;
    await index.schema
      .createTable("key_index")
      .ifNotExists()
      .addColumn("document_id", "text", (c) => c.notNull())
      .addColumn("key", "text", (c) => c.notNull())
      .execute();
    await index
      .insertInto("key_index")
      .values([
        { document_id: "a", key: "k1" },
        { document_id: "orphan", key: "k2" },
      ])
      .execute();
    await permissions.setDocumentProtection(DRIVE, true);
    await permissions.setDocumentOwner(DRIVE, OWNER);
    await until(async () => !(await readable(USER)).includes("a"));

    const keysFor = async (user: string | undefined) =>
      (
        await applyReadableFilter(
          index.selectFrom("key_index").select("key"),
          "document_id",
          projection.filterFor(user),
        ).execute()
      )
        .map((r) => r.key)
        .sort();
    expect(await keysFor(USER)).toEqual(["k2"]);
    expect(await keysFor(ADMIN)).toEqual(["k1", "k2"]);
    // a filter of "none" answers no row
    expect(
      await applyReadableFilter(
        index.selectFrom("key_index").select("key"),
        "document_id",
        { kind: "none" },
      ).execute(),
    ).toEqual([]);
    // structure rows named by `passWhen` are listed whatever the filter says
    const passing = (filter: Parameters<typeof applyReadableFilter>[2]) =>
      applyReadableFilter(
        index.selectFrom("key_index").select("key"),
        "document_id",
        filter,
        { passWhen: { column: "key", equals: "k1" } },
      )
        .execute()
        .then((rows) => rows.map((r) => r.key).sort());
    expect(await passing(projection.filterFor(USER))).toEqual(["k1", "k2"]);
    expect(await passing({ kind: "none" })).toEqual(["k1"]);
  });

  it("answers from the policy alone under OPEN and ADMIN_ONLY, keeping no rows", async () => {
    const under = (policy: AuthorizationPolicy) =>
      new ReadableDocumentsProjection({
        relationalDb,
        read: reactor.read as never,
        config: { policy, admins: [ADMIN], defaultProtection: false },
      });
    const open = under(AuthorizationPolicy.OPEN);
    await open.start();
    expect(open.filterFor(undefined)).toEqual({ kind: "all" });
    const adminOnly = under(AuthorizationPolicy.ADMIN_ONLY);
    await adminOnly.start();
    expect(adminOnly.filterFor(USER)).toEqual({ kind: "none" });
    expect(adminOnly.filterFor(ADMIN)).toEqual({ kind: "all" });
    expect(EVERYONE).toBe("*");
  });

  it("notifies listeners of the permission service after each write", async () => {
    const touched: string[] = [];
    const off = permissions.onChange((id) => touched.push(id));
    await permissions.grantPermission("x", USER, "READ", ADMIN);
    await permissions.setDocumentOwner("y", OWNER);
    await permissions.revokePermission("x", USER);
    off();
    await permissions.setDocumentProtection("z", true);
    expect(touched).toEqual(["x", "y", "x"]);
  });

  it("fails closed for a non-admin before the first rebuild has finished", () => {
    const fresh = new ReadableDocumentsProjection({
      relationalDb,
      read: reactor.read as never,
      permissions,
      config: {
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        admins: [ADMIN],
        defaultProtection: false,
      },
    });
    expect(fresh.filterFor(USER)).toEqual({ kind: "none" });
    expect(fresh.filterFor(ADMIN)).toEqual({ kind: "all" });
    void sql;
  });
});
