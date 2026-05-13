import { MemoryFS, PGlite } from "@electric-sql/pglite";
import type { IReactorClient, JobInfo } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorDriveClient } from "../src/client/reactor-drive-client.js";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../src/constants.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { up as createDocumentNameTable } from "../src/schema/migrations/0002_document_name.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";

function createJobInfo(): JobInfo {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
  } as unknown as JobInfo;
}

function createMockReactor(overrides: Partial<IReactorClient> = {}) {
  const execute = vi.fn().mockResolvedValue(createJobInfo());
  const rename = vi.fn().mockResolvedValue(createJobInfo());
  const deleteDocument = vi.fn().mockResolvedValue(createJobInfo());
  const create = vi
    .fn()
    .mockImplementation((doc: unknown) => Promise.resolve(doc));
  const get = vi.fn();
  const setPreferredEditor = vi.fn().mockResolvedValue(createJobInfo());

  const reactor = {
    execute,
    rename,
    deleteDocument,
    create,
    get,
    setPreferredEditor,
    ...overrides,
  } as unknown as IReactorClient;

  return {
    reactor,
    execute,
    rename,
    deleteDocument,
    create,
    get,
    setPreferredEditor,
  };
}

describe("ReactorDriveClient", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let view: DriveNodeView;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({
      dialect: new PGliteDialect(pg),
    });
    await createDriveNodeTable(db as unknown as Kysely<unknown>);
    await createDocumentNameTable(db as unknown as Kysely<unknown>);
    view = new DriveNodeView(db);
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  async function seed(
    driveId: string,
    rows: Array<{
      id: string;
      kind: "file" | "folder";
      name: string;
      parentFolder: string | null;
      documentType?: string | null;
    }>,
  ) {
    await db
      .insertInto("DriveNode")
      .values(
        rows.map((row) => ({
          driveId,
          id: row.id,
          kind: row.kind,
          name: row.name,
          requestedName: row.name,
          parentFolder: row.parentFolder,
          documentType: row.documentType ?? null,
        })),
      )
      .execute();
  }

  it("addFolder issues a single ADD_FOLDER targeting the drive", async () => {
    const { reactor, execute } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    const folder = await client.addFolder("drive-1", "Notes");

    expect(folder.kind).toBe("folder");
    expect(folder.name).toBe("Notes");
    expect(folder.parentFolder).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    const [driveId, branch, actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(driveId).toBe("drive-1");
    expect(branch).toBe("main");
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("ADD_FOLDER");
    expect(actions[0].input).toMatchObject({
      folderId: folder.id,
      parentFolderId: null,
      name: "Notes",
    });
  });

  it("addFolder under a parentFolder carries the parent id in the action input", async () => {
    const { reactor, execute } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    const folder = await client.addFolder("drive-1", "Sub", "parent-folder");

    expect(folder.parentFolder).toBe("parent-folder");
    const [driveId, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(driveId).toBe("drive-1");
    expect(actions[0].input).toMatchObject({
      folderId: folder.id,
      parentFolderId: "parent-folder",
      name: "Sub",
    });
  });

  it("addFile creates the document and adds a drive/child relationship with file metadata", async () => {
    const { reactor, execute, create } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });
    const doc = {
      header: { id: "file-1", documentType: "powerhouse/document-model" },
    } as never;

    await client.addFile("drive-1", doc);

    expect(create).toHaveBeenCalledWith(doc, undefined, undefined);
    const [driveId, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(driveId).toBe("drive-1");
    expect(actions[0].type).toBe("ADD_RELATIONSHIP");
    expect(actions[0].input).toMatchObject({
      sourceId: "drive-1",
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
      metadata: { kind: "file", parentFolderId: null },
    });
  });

  it("addFile under a parentFolder records parentFolderId in metadata", async () => {
    const { reactor, execute } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });
    const doc = {
      header: { id: "file-1", documentType: "powerhouse/document-model" },
    } as never;

    await client.addFile("drive-1", doc, "parent-folder");

    const [, , actions] = execute.mock.calls[0] as [string, string, Action[]];
    expect(actions[0].input).toMatchObject({
      sourceId: "drive-1",
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
      metadata: { kind: "file", parentFolderId: "parent-folder" },
    });
  });

  it("renameNode on a file delegates to reactor.rename and re-reads the node", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      {
        id: "file-1",
        kind: "file",
        name: "old",
        parentFolder: null,
        documentType: "powerhouse/document-model",
      },
    ]);
    const { reactor, rename, execute } = createMockReactor();
    rename.mockImplementation(async () => {
      await db
        .updateTable("DriveNode")
        .set({ name: "new", requestedName: "new" })
        .where("driveId", "=", driveId)
        .where("id", "=", "file-1")
        .execute();
      return createJobInfo();
    });
    const client = new ReactorDriveClient({ reactor, readModel: view });

    const result = await client.renameNode(driveId, "file-1", "new");

    expect(rename).toHaveBeenCalledWith("file-1", "new", "main", undefined);
    expect(execute).not.toHaveBeenCalled();
    expect(result.name).toBe("new");
  });

  it("renameNode on a folder issues UPDATE_FOLDER and never calls rename", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      { id: "folder-1", kind: "folder", name: "old", parentFolder: null },
    ]);
    const { reactor, rename, execute } = createMockReactor();
    execute.mockImplementation(async () => {
      await db
        .updateTable("DriveNode")
        .set({ name: "new", requestedName: "new" })
        .where("driveId", "=", driveId)
        .where("id", "=", "folder-1")
        .execute();
      return createJobInfo();
    });
    const client = new ReactorDriveClient({ reactor, readModel: view });

    const result = await client.renameNode(driveId, "folder-1", "new");

    expect(rename).not.toHaveBeenCalled();
    const [executedDriveId, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(executedDriveId).toBe(driveId);
    expect(actions[0].type).toBe("UPDATE_FOLDER");
    expect(actions[0].input).toMatchObject({
      folderId: "folder-1",
      name: "new",
    });
    expect(result.name).toBe("new");
  });

  it("removeNode on a file removes the relationship and deletes the document", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      {
        id: "file-1",
        kind: "file",
        name: "doc",
        parentFolder: null,
        documentType: "powerhouse/document-model",
      },
    ]);
    const { reactor, execute, deleteDocument } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    await client.removeNode(driveId, "file-1");

    const [, , actions] = execute.mock.calls[0] as [string, string, Action[]];
    expect(actions[0].type).toBe("REMOVE_RELATIONSHIP");
    expect(actions[0].input).toMatchObject({
      sourceId: driveId,
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
    });
    expect(deleteDocument).toHaveBeenCalledWith("file-1", undefined, undefined);
  });

  it("removeNode on a folder batches REMOVE_RELATIONSHIP per file + REMOVE_FOLDER deepest-first + REMOVE_FOLDER(root) and cascade-deletes files", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      { id: "folder", kind: "folder", name: "F", parentFolder: null },
      { id: "sub", kind: "folder", name: "Sub", parentFolder: "folder" },
      {
        id: "file-1",
        kind: "file",
        name: "a.md",
        parentFolder: "folder",
        documentType: "powerhouse/document-model",
      },
      {
        id: "file-2",
        kind: "file",
        name: "b.md",
        parentFolder: "sub",
        documentType: "powerhouse/document-model",
      },
    ]);
    const { reactor, execute, deleteDocument } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    await client.removeNode(driveId, "folder");

    expect(execute).toHaveBeenCalledTimes(1);
    const [executedDriveId, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(executedDriveId).toBe(driveId);

    const removeRelationshipActions = actions.filter(
      (a) => a.type === "REMOVE_RELATIONSHIP",
    );
    const removeFolderActions = actions.filter(
      (a) => a.type === "REMOVE_FOLDER",
    );
    expect(removeRelationshipActions).toHaveLength(2);
    expect(removeFolderActions).toHaveLength(2);

    const fileTargets = new Set(
      removeRelationshipActions.map(
        (a) => (a.input as { targetId: string }).targetId,
      ),
    );
    expect(fileTargets).toEqual(new Set(["file-1", "file-2"]));

    const folderIds = removeFolderActions.map(
      (a) => (a.input as { folderId: string }).folderId,
    );
    expect(folderIds).toEqual(["sub", "folder"]);

    const deletedIds = deleteDocument.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(new Set(deletedIds)).toEqual(new Set(["file-1", "file-2"]));
    for (const call of deleteDocument.mock.calls) {
      expect(call[1]).toBe("cascade");
    }
  });

  it("moveNode on a folder emits UPDATE_FOLDER with the new parentFolderId", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      { id: "folder", kind: "folder", name: "F", parentFolder: null },
      { id: "target", kind: "folder", name: "T", parentFolder: null },
    ]);
    const { reactor, execute, get } = createMockReactor();
    get.mockResolvedValue({
      header: { id: driveId, documentType: "powerhouse/reactor-drive" },
      state: { global: { name: "Drive", icon: null } },
    });
    const client = new ReactorDriveClient({ reactor, readModel: view });

    await client.moveNode(driveId, "folder", "target");

    const [executedDriveId, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(executedDriveId).toBe(driveId);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("UPDATE_FOLDER");
    expect(actions[0].input).toMatchObject({
      folderId: "folder",
      parentFolderId: "target",
    });
  });

  it("moveNode on a file emits REMOVE_RELATIONSHIP + ADD_RELATIONSHIP both sourced from the drive", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      {
        id: "file-1",
        kind: "file",
        name: "doc.md",
        parentFolder: null,
        documentType: "powerhouse/document-model",
      },
      { id: "target", kind: "folder", name: "T", parentFolder: null },
    ]);
    const { reactor, execute, get } = createMockReactor();
    get.mockResolvedValue({
      header: { id: driveId, documentType: "powerhouse/reactor-drive" },
      state: { global: { name: "Drive", icon: null } },
    });
    const client = new ReactorDriveClient({ reactor, readModel: view });

    await client.moveNode(driveId, "file-1", "target");

    const [, , actions] = execute.mock.calls[0] as [string, string, Action[]];
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("REMOVE_RELATIONSHIP");
    expect(actions[0].input).toMatchObject({
      sourceId: driveId,
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
    });
    expect(actions[1].type).toBe("ADD_RELATIONSHIP");
    expect(actions[1].input).toMatchObject({
      sourceId: driveId,
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
      metadata: { kind: "file", parentFolderId: "target" },
    });
  });

  it("listNodes returns shaped legacy Node entries and paging", async () => {
    const driveId = "drive-1";
    await seed(driveId, [
      { id: "folder", kind: "folder", name: "F", parentFolder: null },
      {
        id: "file-1",
        kind: "file",
        name: "a.md",
        parentFolder: null,
        documentType: "powerhouse/document-model",
      },
    ]);
    const { reactor } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    const page = await client.listNodes(driveId, null, {
      cursor: "",
      limit: 10,
    });

    expect(page.results).toHaveLength(2);
    const file = page.results.find((n) => n.id === "file-1");
    expect(file).toMatchObject({
      kind: "file",
      name: "a.md",
      documentType: "powerhouse/document-model",
    });
    const folder = page.results.find((n) => n.id === "folder");
    expect(folder).toMatchObject({ kind: "folder", name: "F" });
  });

  it("getNode throws when the node is missing", async () => {
    const { reactor } = createMockReactor();
    const client = new ReactorDriveClient({ reactor, readModel: view });

    await expect(client.getNode("drive-1", "missing")).rejects.toThrow(
      /not found/,
    );
  });
});
