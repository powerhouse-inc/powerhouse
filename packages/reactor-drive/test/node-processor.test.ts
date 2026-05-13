import { MemoryFS, PGlite } from "@electric-sql/pglite";
import {
  addRelationshipAction,
  ConsistencyTracker,
  createDocumentAction,
  removeRelationshipAction,
  removeRelationshipSubtreeAction,
  updateRelationshipAction,
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

  it("adds a folder via ADD_RELATIONSHIP with kind=folder metadata", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addRelationshipAction(
          driveId,
          folderId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          {
            kind: "folder",
            name: "Reports",
          },
        ),
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

  it("resolves sibling name collisions with deterministic suffixes", async () => {
    const driveId = "drive-1";
    await processor.indexOperations([
      wrap(
        addRelationshipAction(driveId, "f1", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
          name: "Notes",
        }),
        driveId,
      ),
      wrap(
        addRelationshipAction(driveId, "f2", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
          name: "Notes",
        }),
        driveId,
      ),
      wrap(
        addRelationshipAction(driveId, "f3", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
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

  it("renames a folder via UPDATE_RELATIONSHIP", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addRelationshipAction(
          driveId,
          folderId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          {
            kind: "folder",
            name: "Old",
          },
        ),
        driveId,
      ),
      wrap(
        updateRelationshipAction(
          driveId,
          folderId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          {
            kind: "folder",
            name: "New",
          },
        ),
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

  it("removes a single relationship row", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    await processor.indexOperations([
      wrap(
        addRelationshipAction(
          driveId,
          folderId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
          {
            kind: "folder",
            name: "X",
          },
        ),
        driveId,
      ),
      wrap(
        removeRelationshipAction(
          driveId,
          folderId,
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        driveId,
      ),
    ]);
    const row = await db
      .selectFrom("DriveNode")
      .selectAll()
      .where("id", "=", folderId)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it("removes a subtree via REMOVE_RELATIONSHIP_SUBTREE", async () => {
    const driveId = "drive-1";
    await processor.indexOperations([
      wrap(
        addRelationshipAction(driveId, "f1", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
          name: "F1",
        }),
        driveId,
      ),
      wrap(
        addRelationshipAction("f1", "f2", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
          name: "F2",
        }),
        driveId,
      ),
      wrap(
        addRelationshipAction("f2", "f3", DRIVE_CHILD_RELATIONSHIP_TYPE, {
          kind: "folder",
          name: "F3",
        }),
        driveId,
      ),
    ]);
    expect(
      (await db.selectFrom("DriveNode").selectAll().execute()).length,
    ).toBe(3);

    await processor.indexOperations([
      wrap(
        removeRelationshipSubtreeAction(
          driveId,
          "f1",
          DRIVE_CHILD_RELATIONSHIP_TYPE,
        ),
        driveId,
      ),
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
