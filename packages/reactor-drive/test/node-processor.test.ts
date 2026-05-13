import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  addRelationshipAction,
  ConsistencyTracker,
  createDocumentAction,
  removeRelationshipAction,
  type IOperationIndex,
  type IWriteCache,
} from "@powerhousedao/reactor";
import {
  actions as documentModelActions,
  generateId,
  type Operation,
  type OperationContext,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFolderAction,
  removeFolderAction,
  updateFolderAction,
} from "../src/actions.js";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../src/constants.js";
import {
  NodeProcessor,
  type NodeProcessorDatabase,
} from "../src/processors/node-processor.js";
import { up as createDocumentNameTable } from "../src/schema/migrations/0002_document_name.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";

let nextOrdinal = 1;

function makeContext(documentId: string, scope = "document"): OperationContext {
  return {
    documentId,
    documentType: "powerhouse/reactor-drive",
    scope,
    branch: "main",
    ordinal: nextOrdinal++,
  };
}

function wrap(
  action: { type: string; input: unknown },
  documentId: string,
): OperationWithContext {
  const op: Operation = {
    id: generateId(),
    index: 0,
    skip: 0,
    timestampUtcMs: new Date().toISOString(),
    hash: "",
    action: action as unknown as Operation["action"],
  };
  return { operation: op, context: makeContext(documentId, "document") };
}

describe("NodeProcessor", () => {
  let pg: PGlite;
  let db: Kysely<NodeProcessorDatabase>;
  let processor: NodeProcessor;

  beforeEach(async () => {
    nextOrdinal = 1;
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<NodeProcessorDatabase>({
      dialect: new PGliteDialect(pg),
    });

    await db.schema
      .createTable("ViewState")
      .addColumn("readModelId", "text", (col) => col.primaryKey())
      .addColumn("lastOrdinal", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
        col.notNull().defaultTo(sql`NOW()`),
      )
      .execute();

    await db.schema
      .createTable("DocumentSnapshot")
      .addColumn("documentId", "text", (col) => col.notNull())
      .addColumn("documentType", "text", (col) => col.notNull())
      .execute();

    await createDriveNodeTable(db as unknown as Kysely<unknown>);
    await createDocumentNameTable(db as unknown as Kysely<unknown>);

    const operationIndex = {
      getSinceOrdinal: vi.fn().mockResolvedValue({ results: [] }),
    } as unknown as IOperationIndex;
    const writeCache = {
      getState: vi.fn(),
      putState: vi.fn(),
      invalidate: vi.fn().mockReturnValue(0),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as IWriteCache;
    const tracker = new ConsistencyTracker();
    processor = new NodeProcessor(db, operationIndex, writeCache, tracker);
    await processor.init();
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  it("adds a folder via ADD_FOLDER", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId,
          parentFolderId: null,
          name: "Reports",
        }),
        driveId,
      ),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", folderId)
      .executeTakeFirst();
    expect(row).toBeDefined();
    expect(row?.kind).toBe("folder");
    expect(row?.name).toBe("Reports");
    expect(row?.parentFolder).toBeNull();
  });

  it("nests folders under a parent folder", async () => {
    const driveId = "drive-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId: "parent",
          parentFolderId: null,
          name: "Parent",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "child",
          parentFolderId: "parent",
          name: "Child",
        }),
        driveId,
      ),
    ]);

    const child = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", "child")
      .executeTakeFirst();
    expect(child?.parentFolder).toBe("parent");
  });

  it("resolves sibling name collisions with deterministic suffixes", async () => {
    const driveId = "drive-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId: "f1",
          parentFolderId: null,
          name: "Notes",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "f2",
          parentFolderId: null,
          name: "Notes",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "f3",
          parentFolderId: null,
          name: "Notes",
        }),
        driveId,
      ),
    ]);

    const rows = await db
      .selectFrom("DriveNode")
      .select(["id", "name"])
      .orderBy("id")
      .execute();
    expect(rows.map((r) => r.name)).toEqual([
      "Notes",
      "Notes (2)",
      "Notes (3)",
    ]);
  });

  it("renames a folder via UPDATE_FOLDER", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId,
          parentFolderId: null,
          name: "Old",
        }),
        driveId,
      ),
      wrap(
        updateFolderAction({
          folderId,
          name: "New",
        }),
        driveId,
      ),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", folderId)
      .executeTakeFirst();
    expect(row?.name).toBe("New");
    expect(row?.requestedName).toBe("New");
  });

  it("reparents a folder via UPDATE_FOLDER", async () => {
    const driveId = "drive-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId: "parent",
          parentFolderId: null,
          name: "Parent",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "child",
          parentFolderId: null,
          name: "Child",
        }),
        driveId,
      ),
      wrap(
        updateFolderAction({
          folderId: "child",
          parentFolderId: "parent",
        }),
        driveId,
      ),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", "child")
      .executeTakeFirst();
    expect(row?.parentFolder).toBe("parent");
  });

  it("removes a folder via REMOVE_FOLDER", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId,
          parentFolderId: null,
          name: "X",
        }),
        driveId,
      ),
      wrap(removeFolderAction({ folderId }), driveId),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", folderId)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it("removes a file via REMOVE_RELATIONSHIP", async () => {
    const driveId = "drive-1";
    const fileId = "file-1";

    await (
      db as unknown as Kysely<{
        DocumentSnapshot: { documentId: string; documentType: string };
      }>
    )
      .insertInto("DocumentSnapshot")
      .values({ documentId: fileId, documentType: "powerhouse/document-model" })
      .execute();

    await processor.indexOperations([
      wrap(
        addRelationshipAction(driveId, fileId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
        }),
        driveId,
      ),
      wrap(
        removeRelationshipAction(
          driveId,
          fileId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        driveId,
      ),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", fileId)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it("removes a subtree via batched REMOVE_RELATIONSHIP and REMOVE_FOLDER actions", async () => {
    const driveId = "drive-1";

    await (
      db as unknown as Kysely<{
        DocumentSnapshot: { documentId: string; documentType: string };
      }>
    )
      .insertInto("DocumentSnapshot")
      .values({
        documentId: "file-1",
        documentType: "powerhouse/document-model",
      })
      .execute();

    await processor.indexOperations([
      wrap(
        addFolderAction({
          folderId: "f1",
          parentFolderId: null,
          name: "F1",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "f2",
          parentFolderId: "f1",
          name: "F2",
        }),
        driveId,
      ),
      wrap(
        addFolderAction({
          folderId: "f3",
          parentFolderId: "f2",
          name: "F3",
        }),
        driveId,
      ),
      wrap(
        addRelationshipAction(
          driveId,
          "file-1",
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          {
            kind: "file",
            parentFolderId: "f2",
          },
        ),
        driveId,
      ),
    ]);
    expect(
      (await db.selectFrom("DriveNode").selectAll().execute()).length,
    ).toBe(4);

    await processor.indexOperations([
      wrap(
        removeRelationshipAction(
          driveId,
          "file-1",
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        driveId,
      ),
      wrap(removeFolderAction({ folderId: "f3" }), driveId),
      wrap(removeFolderAction({ folderId: "f2" }), driveId),
      wrap(removeFolderAction({ folderId: "f1" }), driveId),
    ]);
    expect(
      (await db.selectFrom("DriveNode").selectAll().execute()).length,
    ).toBe(0);
  });

  it("picks up document names from CREATE_DOCUMENT and propagates on SET_NAME", async () => {
    const driveId = "drive-1";
    const docId = "doc-1";

    await (
      db as unknown as Kysely<{
        DocumentSnapshot: { documentId: string; documentType: string };
      }>
    )
      .insertInto("DocumentSnapshot")
      .values({ documentId: docId, documentType: "powerhouse/document-model" })
      .execute();

    await processor.indexOperations([
      wrap(
        createDocumentAction({
          model: "powerhouse/document-model",
          version: 0,
          documentId: docId,
          name: "First",
        }),
        docId,
      ),
      wrap(
        addRelationshipAction(driveId, docId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
        }),
        driveId,
      ),
    ]);

    let row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", docId)
      .executeTakeFirst();
    expect(row?.kind).toBe("file");
    expect(row?.name).toBe("First");

    await processor.indexOperations([
      wrap(documentModelActions.setName({ name: "Renamed" }), docId),
    ]);

    row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", docId)
      .executeTakeFirst();
    expect(row?.name).toBe("Renamed");
    expect(row?.requestedName).toBe("Renamed");

    const docName = await db
      .selectFrom("DocumentName")
      .selectAll()
      .where("docId", "=", docId)
      .executeTakeFirst();
    expect(docName?.name).toBe("Renamed");
  });
});
