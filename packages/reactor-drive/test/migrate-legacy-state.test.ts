import { MemoryFS, PGlite } from "@electric-sql/pglite";
import type { IReactorClient, JobInfo } from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import type { Action } from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRIVE_CHILD_RELATIONSHIP_TYPE } from "../src/constants.js";
import { migrateLegacyDriveState } from "../src/migration/migrate-legacy-state.js";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { up as createDocumentNameTable } from "../src/schema/migrations/0002_document_name.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";

function createReactor() {
  const execute = vi
    .fn()
    .mockResolvedValue({ id: "job" } as unknown as JobInfo);
  const reactor = { execute } as unknown as IReactorClient;
  return { reactor, execute };
}

describe("migrateLegacyDriveState", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let view: DriveNodeView;
  const driveId = "drive-1";

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

  it("emits ADD_FOLDER for folders and ADD_RELATIONSHIP for files, parents before children", async () => {
    const { reactor, execute } = createReactor();
    const nodes: Node[] = [
      {
        id: "file-1",
        kind: "file",
        name: "doc.md",
        documentType: "powerhouse/document-model",
        parentFolder: "folder-1",
      },
      { id: "folder-1", kind: "folder", name: "Folder", parentFolder: null },
    ];

    const result = await migrateLegacyDriveState({
      reactor,
      readModel: view,
      driveId,
      nodes,
    });

    expect(result.emittedActions).toBe(2);
    expect(result.skippedExisting).toBe(0);
    const [executedDriveId, branch, actions] = execute.mock.calls[0] as [
      string,
      string,
      Action[],
    ];
    expect(executedDriveId).toBe(driveId);
    expect(branch).toBe("main");
    expect(actions[0].type).toBe("ADD_FOLDER");
    expect(actions[0].input).toMatchObject({
      folderId: "folder-1",
      parentFolderId: null,
      name: "Folder",
    });
    expect(actions[1].type).toBe("ADD_RELATIONSHIP");
    expect(actions[1].input).toMatchObject({
      sourceId: driveId,
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
      metadata: { kind: "file", parentFolderId: "folder-1" },
    });
  });

  it("skips nodes that already exist in the projection", async () => {
    await db
      .insertInto("DriveNode")
      .values({
        driveId,
        id: "folder-1",
        kind: "folder",
        name: "Folder",
        requestedName: "Folder",
        parentFolder: null,
        documentType: null,
      })
      .execute();
    const { reactor, execute } = createReactor();

    const result = await migrateLegacyDriveState({
      reactor,
      readModel: view,
      driveId,
      nodes: [
        { id: "folder-1", kind: "folder", name: "Folder", parentFolder: null },
        {
          id: "file-1",
          kind: "file",
          name: "doc.md",
          documentType: "powerhouse/document-model",
          parentFolder: "folder-1",
        },
      ],
    });

    expect(result.emittedActions).toBe(1);
    expect(result.skippedExisting).toBe(1);
    const [, , actions] = execute.mock.calls[0] as [string, string, Action[]];
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("ADD_RELATIONSHIP");
    expect(actions[0].input).toMatchObject({
      sourceId: driveId,
      targetId: "file-1",
      relationshipType: DRIVE_CHILD_RELATIONSHIP_TYPE,
      metadata: { kind: "file", parentFolderId: "folder-1" },
    });
  });

  it("is a noop when all nodes are already migrated", async () => {
    await db
      .insertInto("DriveNode")
      .values({
        driveId,
        id: "folder-1",
        kind: "folder",
        name: "Folder",
        requestedName: "Folder",
        parentFolder: null,
        documentType: null,
      })
      .execute();
    const { reactor, execute } = createReactor();

    const result = await migrateLegacyDriveState({
      reactor,
      readModel: view,
      driveId,
      nodes: [
        { id: "folder-1", kind: "folder", name: "Folder", parentFolder: null },
      ],
    });

    expect(result.emittedActions).toBe(0);
    expect(result.skippedExisting).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });
});
