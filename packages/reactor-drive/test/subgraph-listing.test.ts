import { MemoryFS, PGlite } from "@electric-sql/pglite";
import type { IReactorClient } from "@powerhousedao/reactor";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriveNodeView } from "../src/read-model/drive-node-view.js";
import { runReactorDriveMigrations } from "../src/schema/migrations/migrator.js";
import type { ReactorDriveDatabase } from "../src/schema/tables.js";
import {
  createReactorDriveResolvers,
  type ReactorDriveResolverContext,
} from "../src/subgraph/index.js";

const DRIVE = "drive-1";

type Page = Awaited<
  ReturnType<
    ReturnType<typeof createReactorDriveResolvers>["ReactorDrive"]["rootNodes"]
  >
>;

function cursorId(cursor: string): string {
  return (JSON.parse(globalThis.atob(cursor)) as { id: string }).id;
}

describe("reactor-drive subgraph listing with withheld nodes", () => {
  let pg: PGlite;
  let db: Kysely<ReactorDriveDatabase>;
  let withheld: Set<string>;
  let find: ReturnType<typeof vi.fn>;
  let isServed: ReturnType<typeof vi.fn>;
  let ctx: ReactorDriveResolverContext;
  const resolvers = createReactorDriveResolvers();

  beforeEach(async () => {
    pg = new PGlite({ fs: new MemoryFS() });
    db = new Kysely<ReactorDriveDatabase>({ dialect: new PGliteDialect(pg) });
    await runReactorDriveMigrations(db as unknown as Kysely<unknown>, "public");
    withheld = new Set();
    find = vi.fn(({ ids }: { ids: string[] }) =>
      Promise.resolve({
        results: ids
          .filter((id) => !withheld.has(id))
          .map((id) => ({ header: { id } })),
      }),
    );
    isServed = vi.fn((id: string) => Promise.resolve(!withheld.has(id)));
    ctx = {
      reactorClient: { find, isServed } as unknown as IReactorClient,
      readModel: new DriveNodeView(db),
    };
  });

  afterEach(async () => {
    await db.destroy();
    await pg.close();
  });

  /** Inserts root nodes in order, one second apart; `x*` ids are withheld files. */
  async function insert(nodes: { id: string; kind: "file" | "folder" }[]) {
    const base = Date.parse("2024-01-01T00:00:00.000Z");
    await db
      .insertInto("DriveNode")
      .values(
        nodes.map(({ id, kind }, i) => {
          const createdAt = new Date(base + i * 1000);
          return {
            driveId: DRIVE,
            id,
            kind,
            name: id,
            requestedName: id,
            parentFolder: null,
            documentType: kind === "file" ? "powerhouse/document-model" : null,
            createdAt,
            updatedAt: createdAt,
          };
        }),
      )
      .execute();
    for (const { id } of nodes) {
      if (id.startsWith("x")) withheld.add(id);
    }
  }

  const files = (...ids: string[]) =>
    ids.map((id) => ({ id, kind: "file" as const }));

  function rootNodes(
    limit: number,
    cursor = "",
    kind?: "FILE" | "FOLDER" | null,
  ): Promise<Page> {
    return resolvers.ReactorDrive.rootNodes(
      { id: DRIVE },
      { paging: { cursor, limit }, kind },
      ctx,
    );
  }

  async function all(limit: number): Promise<{ ids: string[]; pages: Page[] }> {
    const pages: Page[] = [];
    let cursor = "";
    for (;;) {
      const page = await rootNodes(limit, cursor);
      pages.push(page);
      if (!page.hasMore) break;
      cursor = page.nextCursor!;
    }
    return { ids: pages.flatMap((p) => p.results.map((n) => n.id)), pages };
  }

  it("never names a withheld node in nextCursor", async () => {
    await insert(files("a", "x1", "b", "x2", "c", "x3"));

    const { ids, pages } = await all(2);

    expect(ids).toEqual(["a", "b", "c"]);
    for (const page of pages) {
      if (page.nextCursor !== undefined) {
        expect(withheld.has(cursorId(page.nextCursor))).toBe(false);
      }
    }
  });

  it("advances past a window of withheld nodes", async () => {
    await insert(files("x1", "x2", "a"));

    const page = await rootNodes(2);

    expect(page.results.map((n) => n.id)).toEqual(["a"]);
    expect(page.hasMore).toBe(false);
  });

  it("advances past a withheld run longer than the scan cap", async () => {
    const run = Array.from({ length: 12 }, (_, i) => `x${i}`);
    await insert(files(...run, "a", ...run.map((id) => `${id}b`), "b"));

    const first = await rootNodes(1);

    expect(first.results.map((n) => n.id)).toEqual(["a"]);
    expect(first.hasMore).toBe(true);
    expect(cursorId(first.nextCursor!)).toBe("a");

    const second = await rootNodes(1, first.nextCursor);

    expect(second.results.map((n) => n.id)).toEqual(["b"]);
    expect(second.hasMore).toBe(false);
  });

  it("returns a page anchored on its last served node when the scan cap is hit", async () => {
    const run = Array.from({ length: 10 }, (_, i) => `x${i}`);
    await insert(files("a", ...run, "b"));

    const first = await rootNodes(2);

    expect(first.results.map((n) => n.id)).toEqual(["a"]);
    expect(first.hasMore).toBe(true);
    expect(cursorId(first.nextCursor!)).toBe("a");

    const second = await rootNodes(2, first.nextCursor);
    expect(second.results.map((n) => n.id)).toEqual(["b"]);
    expect(second.hasMore).toBe(false);
  });

  it("advances past a withheld node whose createdAt has sub-millisecond precision", async () => {
    for (const [id, at] of [
      ["x1", "2024-01-01T00:00:00.000100Z"],
      ["a", "2024-01-01T00:00:00.000200Z"],
    ]) {
      await db
        .insertInto("DriveNode")
        .values({
          driveId: DRIVE,
          id,
          kind: "file",
          name: id,
          requestedName: id,
          parentFolder: null,
          documentType: "powerhouse/document-model",
          createdAt: sql<Date>`${at}::timestamptz`,
        })
        .execute();
    }
    withheld.add("x1");

    const page = await rootNodes(1);

    expect(page.results.map((n) => n.id)).toEqual(["a"]);
  });

  it("may end with an empty page when only withheld nodes follow", async () => {
    await insert(files("a", "b", "x1"));

    const { ids, pages } = await all(2);

    expect(ids).toEqual(["a", "b"]);
    expect(pages.map((p) => p.results.length)).toEqual([2, 0]);
  });

  it("serves a FILE page of one when folders precede the file", async () => {
    await insert([
      { id: "d1", kind: "folder" },
      { id: "d2", kind: "folder" },
      { id: "a", kind: "file" },
    ]);

    const page = await rootNodes(1, "", "FILE");

    expect(page.results.map((n) => n.id)).toEqual(["a"]);
  });

  it("serves every kind when kind is null", async () => {
    await insert([
      { id: "d1", kind: "folder" },
      { id: "a", kind: "file" },
    ]);

    const page = await rootNodes(10, "", null);

    expect(page.results.map((n) => n.id)).toEqual(["d1", "a"]);
  });

  it("serves a FOLDER page without consulting the read gate", async () => {
    await insert([
      { id: "a", kind: "file" },
      { id: "d1", kind: "folder" },
      { id: "x1", kind: "file" },
      { id: "d2", kind: "folder" },
    ]);

    const page = await rootNodes(10, "", "FOLDER");

    expect(page.results.map((n) => n.id)).toEqual(["d1", "d2"]);
    expect(find).not.toHaveBeenCalled();
    expect(isServed).not.toHaveBeenCalled();
  });

  it("withholds a file node the host refuses or fails to decide", async () => {
    await insert(files("a", "b", "c"));
    ctx.hostCanRead = (id) =>
      id === "c"
        ? Promise.reject(new Error("down"))
        : Promise.resolve(id !== "a");

    const page = await rootNodes(10);

    expect(page.results.map((n) => n.id)).toEqual(["b"]);
    expect(find).toHaveBeenCalledWith(
      { ids: ["b"] },
      expect.anything(),
      expect.anything(),
    );
  });

  it("gates a page's file nodes in one batch", async () => {
    await insert(files("a", "x1", "b"));

    await rootNodes(10);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(
      { ids: ["a", "x1", "b"] },
      expect.anything(),
      { cursor: "", limit: 3 },
    );
    expect(isServed).not.toHaveBeenCalled();
  });

  it("gates a large batch of file nodes in bounded chunks", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `f${i}`);
    await insert(files(...ids));

    const page = await rootNodes(1001);

    expect(page.results).toHaveLength(1001);
    const sizes = find.mock.calls.map(
      ([search]) => (search as { ids: string[] }).ids.length,
    );
    expect(sizes).toEqual([1000, 1]);
  });
});
