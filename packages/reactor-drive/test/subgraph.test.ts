import { MemoryFS, PGlite } from "@electric-sql/pglite";
import type { IReactorClient } from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import { up as createDocumentNameTable } from "../src/schema/migrations/0002_document_name.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";
import {
  createReactorDriveResolvers,
  type ReactorDriveResolverContext,
} from "../src/subgraph/index.js";

type Resolvers = ReturnType<typeof createReactorDriveResolvers>;

describe("reactor-drive subgraph", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let view: DriveNodeView;
  let resolvers: Resolvers;
  let ctx: ReactorDriveResolverContext;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({
      dialect: new PGliteDialect(pg),
    });
    await createDriveNodeTable(db as unknown as Kysely<unknown>);
    await createDocumentNameTable(db as unknown as Kysely<unknown>);
    view = new DriveNodeView(db);
    resolvers = createReactorDriveResolvers();
    ctx = {
      reactorClient: {} as unknown as IReactorClient,
      readModel: view,
    };
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  it("resolves a drive node and its children", async () => {
    const driveId = "drive-1";
    const folderId = "folder-1";
    const fileId = "file-1";

    await db
      .insertInto("DriveNode")
      .values([
        {
          driveId,
          id: folderId,
          kind: "folder",
          name: "Folder",
          requestedName: "Folder",
          parentFolder: null,
          documentType: null,
        },
        {
          driveId,
          id: fileId,
          kind: "file",
          name: "doc.md",
          requestedName: "doc.md",
          parentFolder: folderId,
          documentType: "powerhouse/document-model",
        },
      ])
      .execute();

    const folder = await resolvers.Query.reactorDriveNode(
      undefined,
      { driveId, id: folderId },
      ctx,
    );
    expect(folder).not.toBeNull();
    expect(resolvers.ReactorDriveNode.__resolveType(folder!)).toBe(
      "ReactorDriveFolderNode",
    );
    expect(folder!.id).toBe(folderId);
    expect(folder!.name).toBe("Folder");

    const childPage = await resolvers.ReactorDriveFolderNode.children(
      { id: folderId, driveId },
      { paging: { cursor: "", limit: 10 } },
      ctx,
    );
    expect(childPage.hasMore).toBe(false);
    expect(childPage.results).toHaveLength(1);
    const child = childPage.results[0];
    expect(resolvers.ReactorDriveNode.__resolveType(child)).toBe(
      "ReactorDriveFileNode",
    );
    expect(child.id).toBe(fileId);
    expect(child.name).toBe("doc.md");
    expect(child.kind === "file" ? child.documentType : null).toBe(
      "powerhouse/document-model",
    );
  });

  it("returns the full subtree via reactorDriveDescendants", async () => {
    const driveId = "drive-1";
    await db
      .insertInto("DriveNode")
      .values([
        {
          driveId,
          id: "a",
          kind: "folder",
          name: "A",
          requestedName: "A",
          parentFolder: null,
          documentType: null,
        },
        {
          driveId,
          id: "b",
          kind: "folder",
          name: "B",
          requestedName: "B",
          parentFolder: "a",
          documentType: null,
        },
        {
          driveId,
          id: "c",
          kind: "file",
          name: "c.md",
          requestedName: "c.md",
          parentFolder: "b",
          documentType: "powerhouse/document-model",
        },
      ])
      .execute();

    const descendants = await resolvers.Query.reactorDriveDescendants(
      undefined,
      { driveId, root: "a" },
      ctx,
    );
    const ids = descendants.map((n) => n.id);
    expect(new Set(ids)).toEqual(new Set(["a", "b", "c"]));
  });
});
