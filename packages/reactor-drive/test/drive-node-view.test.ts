import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely, type LogEvent } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import { up as createDriveNodeTable } from "../src/schema/migrations/0001_drive_node.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";

describe("DriveNodeView.getDescendants (PGlite)", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let view: DriveNodeView;
  const queryLog: string[] = [];

  beforeEach(async () => {
    queryLog.length = 0;
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({
      dialect: new PGliteDialect(pg),
      log: (event: LogEvent) => {
        if (event.level === "query") {
          queryLog.push(event.query.sql);
        }
      },
    });
    await createDriveNodeTable(db as unknown as Kysely<unknown>);
    view = new DriveNodeView(db);
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  async function insertFolder(
    driveId: string,
    id: string,
    parentFolder: string | null,
    name: string,
  ): Promise<void> {
    await db
      .insertInto("DriveNode")
      .values({
        driveId,
        id,
        kind: "folder",
        name,
        requestedName: name,
        parentFolder,
        documentType: null,
      })
      .execute();
  }

  async function insertFile(
    driveId: string,
    id: string,
    parentFolder: string | null,
    name: string,
    documentType: string,
  ): Promise<void> {
    await db
      .insertInto("DriveNode")
      .values({
        driveId,
        id,
        kind: "file",
        name,
        requestedName: name,
        parentFolder,
        documentType,
      })
      .execute();
  }

  it("returns just the root when it has no children", async () => {
    const driveId = "drive-1";
    await insertFolder(driveId, "root", null, "Root");

    const result = await view.getDescendants(driveId, "root");

    expect(result.map((n) => n.id)).toEqual(["root"]);
  });

  it("returns an empty array when the root does not exist", async () => {
    const result = await view.getDescendants("drive-1", "missing");
    expect(result).toEqual([]);
  });

  it("traverses a tree deeper than the legacy BFS frontier could resolve in one query", async () => {
    const driveId = "drive-1";
    const depth = 25;

    await insertFolder(driveId, "folder-0", null, "Level 0");
    for (let i = 1; i < depth; i++) {
      await insertFolder(driveId, `folder-${i}`, `folder-${i - 1}`, `Level ${i}`);
    }
    await insertFile(
      driveId,
      `file-leaf`,
      `folder-${depth - 1}`,
      "leaf",
      "powerhouse/document-model",
    );

    const result = await view.getDescendants(driveId, "folder-0");

    expect(result).toHaveLength(depth + 1);
    expect(result[0].id).toBe("folder-0");
    for (let i = 1; i < depth; i++) {
      expect(result.some((n) => n.id === `folder-${i}`)).toBe(true);
    }
    expect(result.some((n) => n.id === "file-leaf" && n.kind === "file")).toBe(
      true,
    );
  });

  it("returns a branching subtree with all descendants but excludes siblings of the root", async () => {
    const driveId = "drive-1";
    await insertFolder(driveId, "root", null, "Root");
    await insertFolder(driveId, "sibling", null, "Sibling");
    await insertFolder(driveId, "a", "root", "A");
    await insertFolder(driveId, "b", "root", "B");
    await insertFolder(driveId, "a1", "a", "A1");
    await insertFile(
      driveId,
      "a1-file",
      "a1",
      "report",
      "powerhouse/document-model",
    );
    await insertFile(
      driveId,
      "sibling-file",
      "sibling",
      "other",
      "powerhouse/document-model",
    );

    const result = await view.getDescendants(driveId, "root");
    const ids = result.map((n) => n.id).sort();

    expect(ids).toEqual(["a", "a1", "a1-file", "b", "root"]);
  });

  it("does not bleed across drives", async () => {
    await insertFolder("drive-a", "root", null, "Root A");
    await insertFolder("drive-a", "child", "root", "Child A");
    await insertFolder("drive-b", "root", null, "Root B");
    await insertFolder("drive-b", "child", "root", "Child B");

    const result = await view.getDescendants("drive-a", "root");

    expect(result).toHaveLength(2);
    expect(result.every((n) => n.driveId === "drive-a")).toBe(true);
  });

  it("issues a single WITH RECURSIVE statement on PGlite", async () => {
    const driveId = "drive-1";
    await insertFolder(driveId, "root", null, "Root");
    await insertFolder(driveId, "child", "root", "Child");
    await insertFolder(driveId, "grandchild", "child", "Grandchild");

    queryLog.length = 0;
    await view.getDescendants(driveId, "root");

    expect(queryLog).toHaveLength(1);
    expect(queryLog[0]).toMatch(/with\s+recursive/i);
  });
});
