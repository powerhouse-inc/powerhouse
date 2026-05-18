import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  addRelationshipAction,
  ConsistencyTracker,
  createDocumentAction,
  deleteDocumentAction,
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
    processor = new NodeProcessor(
      db as unknown as Kysely<unknown>,
      "public",
      operationIndex,
      writeCache,
      tracker,
    );
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

  it("projects documentType from ADD_RELATIONSHIP metadata without depending on DocumentSnapshot", async () => {
    const driveId = "drive-1";
    const fileId = "file-1";
    const documentType = "powerhouse/budget";

    await processor.indexOperations([
      wrap(
        addRelationshipAction(driveId, fileId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
          documentType,
        }),
        driveId,
      ),
    ]);

    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", fileId)
      .executeTakeFirst();
    expect(row?.kind).toBe("file");
    expect(row?.documentType).toBe(documentType);
  });

  it("rejects ADD_RELATIONSHIP for a drive/child file when metadata is missing documentType", async () => {
    const driveId = "drive-1";
    const fileId = "file-1";

    await expect(
      processor.indexOperations([
        wrap(
          addRelationshipAction(
            driveId,
            fileId,
            DRIVE_CHILD_RELATIONSHIP_TYPE,
            // intentionally missing documentType — runtime invalid even though TS would catch it
            { kind: "file", parentFolderId: null } as unknown as Record<
              string,
              unknown
            >,
          ),
          driveId,
        ),
      ]),
    ).rejects.toThrow(/documentType/);
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
          documentType: "powerhouse/document-model",
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
            documentType: "powerhouse/document-model",
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

  it("removes DriveNode and DocumentName rows on DELETE_DOCUMENT", async () => {
    const driveId = "drive-1";
    const fileId = "file-1";

    await processor.indexOperations([
      wrap(
        createDocumentAction({
          model: "powerhouse/document-model",
          version: 0,
          documentId: fileId,
          name: "Doc",
        }),
        fileId,
      ),
      wrap(
        addRelationshipAction(driveId, fileId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
          documentType: "powerhouse/document-model",
        }),
        driveId,
      ),
    ]);

    expect(
      await db
        .selectFrom("DriveNode")
        .selectAll()
        .where("id", "=", fileId)
        .executeTakeFirst(),
    ).toBeDefined();
    expect(
      await db
        .selectFrom("DocumentName")
        .selectAll()
        .where("docId", "=", fileId)
        .executeTakeFirst(),
    ).toBeDefined();

    await processor.indexOperations([
      wrap(deleteDocumentAction(fileId), fileId),
    ]);

    expect(
      await db
        .selectFrom("DriveNode")
        .selectAll()
        .where("id", "=", fileId)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect(
      await db
        .selectFrom("DocumentName")
        .selectAll()
        .where("docId", "=", fileId)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it("removes DriveNode rows in every drive that linked the deleted document", async () => {
    const driveA = "drive-a";
    const driveB = "drive-b";
    const fileId = "file-shared";

    await processor.indexOperations([
      wrap(
        createDocumentAction({
          model: "powerhouse/document-model",
          version: 0,
          documentId: fileId,
          name: "Shared",
        }),
        fileId,
      ),
      wrap(
        addRelationshipAction(driveA, fileId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
          documentType: "powerhouse/document-model",
        }),
        driveA,
      ),
      wrap(
        addRelationshipAction(driveB, fileId, DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "file",
          parentFolderId: null,
          documentType: "powerhouse/document-model",
        }),
        driveB,
      ),
    ]);

    expect(
      (
        await db
          .selectFrom("DriveNode")
          .selectAll()
          .where("id", "=", fileId)
          .execute()
      ).length,
    ).toBe(2);

    await processor.indexOperations([
      wrap(deleteDocumentAction(fileId), fileId),
    ]);

    expect(
      (
        await db
          .selectFrom("DriveNode")
          .selectAll()
          .where("id", "=", fileId)
          .execute()
      ).length,
    ).toBe(0);
  });

  it("is a noop for DELETE_DOCUMENT when no projection row exists", async () => {
    const orphanId = "orphan-1";

    await expect(
      processor.indexOperations([
        wrap(deleteDocumentAction(orphanId), orphanId),
      ]),
    ).resolves.toBeUndefined();

    expect(
      await db
        .selectFrom("DriveNode")
        .selectAll()
        .where("id", "=", orphanId)
        .executeTakeFirst(),
    ).toBeUndefined();
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
          documentType: "powerhouse/document-model",
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
