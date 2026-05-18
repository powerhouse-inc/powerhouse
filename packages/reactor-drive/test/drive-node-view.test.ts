import { MemoryFS, PGlite } from "@electric-sql/pglite";
import { Kysely, type LogEvent } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import { runReactorDriveMigrations } from "../src/schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";

async function applyReactorDriveMigrations(
  db: Kysely<ReactorDriveDatabase>,
): Promise<void> {
  const result = await runReactorDriveMigrations(
    db as unknown as Kysely<unknown>,
    "public",
  );
  if (!result.success && result.error) {
    throw new Error(`Reactor drive migrations failed: ${result.error.message}`);
  }
}

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
    await applyReactorDriveMigrations(db);
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
      await insertFolder(
        driveId,
        `folder-${i}`,
        `folder-${i - 1}`,
        `Level ${i}`,
      );
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

describe("DriveNodeView.listChildren keyset cursor (PGlite)", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let view: DriveNodeView;

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({ dialect: new PGliteDialect(pg) });
    await applyReactorDriveMigrations(db);
    view = new DriveNodeView(db);
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  async function insertFolderAt(
    driveId: string,
    id: string,
    parentFolder: string | null,
    name: string,
    createdAt: Date,
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
        createdAt,
        updatedAt: createdAt,
      })
      .execute();
  }

  it("issues a non-empty nextCursor only when more results exist", async () => {
    const driveId = "drive-1";
    const base = new Date("2024-01-01T00:00:00.000Z");
    for (let i = 0; i < 3; i++) {
      await insertFolderAt(
        driveId,
        `f${i}`,
        null,
        `F${i}`,
        new Date(base.getTime() + i * 1000),
      );
    }

    const fullPage = await view.listChildren(driveId, null, {
      cursor: "",
      limit: 10,
    });
    expect(fullPage.results).toHaveLength(3);
    expect(fullPage.nextCursor).toBeUndefined();

    const partial = await view.listChildren(driveId, null, {
      cursor: "",
      limit: 2,
    });
    expect(partial.results).toHaveLength(2);
    expect(partial.nextCursor).toBeDefined();
  });

  it("paginates the full set when reads are interleaved with the cursor", async () => {
    const driveId = "drive-1";
    const base = new Date("2024-01-01T00:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      await insertFolderAt(
        driveId,
        `f${i}`,
        null,
        `F${i}`,
        new Date(base.getTime() + i * 1000),
      );
    }

    const seen: string[] = [];
    let cursor = "";
    for (let i = 0; i < 5; i++) {
      const page = await view.listChildren(driveId, null, { cursor, limit: 2 });
      for (const node of page.results) seen.push(node.id);
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(["f0", "f1", "f2", "f3", "f4"]);
  });

  it("does not duplicate or skip rows when a new earlier row is inserted between pages", async () => {
    const driveId = "drive-1";
    const base = new Date("2024-01-01T00:00:00.000Z");
    for (let i = 0; i < 4; i++) {
      await insertFolderAt(
        driveId,
        `f${i}`,
        null,
        `F${i}`,
        new Date(base.getTime() + (i + 1) * 1000),
      );
    }

    const first = await view.listChildren(driveId, null, {
      cursor: "",
      limit: 2,
    });
    expect(first.results.map((n) => n.id)).toEqual(["f0", "f1"]);
    expect(first.nextCursor).toBeDefined();

    await insertFolderAt(driveId, "fnew", null, "FNew", base);

    const second = await view.listChildren(driveId, null, {
      cursor: first.nextCursor!,
      limit: 10,
    });

    expect(second.results.map((n) => n.id)).toEqual(["f2", "f3"]);
  });

  it("breaks ties on id when two rows share the same createdAt", async () => {
    const driveId = "drive-1";
    const sameTs = new Date("2024-01-01T00:00:00.000Z");
    await insertFolderAt(driveId, "a", null, "A", sameTs);
    await insertFolderAt(driveId, "b", null, "B", sameTs);
    await insertFolderAt(driveId, "c", null, "C", sameTs);

    const first = await view.listChildren(driveId, null, {
      cursor: "",
      limit: 2,
    });
    expect(first.results.map((n) => n.id)).toEqual(["a", "b"]);
    expect(first.nextCursor).toBeDefined();

    const second = await view.listChildren(driveId, null, {
      cursor: first.nextCursor!,
      limit: 10,
    });
    expect(second.results.map((n) => n.id)).toEqual(["c"]);
  });

  it("rejects a malformed cursor", async () => {
    await expect(
      view.listChildren("drive-1", null, {
        cursor: "not-base64!@#$",
        limit: 10,
      }),
    ).rejects.toThrow(/cursor/i);
  });

  it("rejects a base64 payload that is not a keyset object", async () => {
    const bogus = globalThis.btoa('"just a string"');
    await expect(
      view.listChildren("drive-1", null, { cursor: bogus, limit: 10 }),
    ).rejects.toThrow(/cursor/i);
  });
});
