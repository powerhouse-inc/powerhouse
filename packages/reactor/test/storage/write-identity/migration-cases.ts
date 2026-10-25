import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as migration028 from "../../../src/storage/migrations/028_create_write_identity.js";
import { runMigrations } from "../../../src/storage/migrations/migrator.js";

/** The last migration before the write identity table. */
export const BEFORE_WRITE_IDENTITY = "027_add_sync_remote_persistence";

/** A fresh, empty database; `destroy` releases it. */
export type MigrationTestDatabase = {
  base: Kysely<any>;
  destroy: () => Promise<void>;
};

type SnapshotSeed = {
  documentId: string;
  scope: string;
  branch?: string;
  slug?: string | null;
  documentType?: string;
  isDeleted?: boolean;
};

type IdentityRow = {
  documentId: string;
  branch: string;
  slug: string | null;
  documentType: string;
  isDeleted: boolean;
  createdAtUtcIso: string;
  updatedAtUtcIso: string;
};

/**
 * The migration's cases against one backend. Runs in a schema other than the
 * reactor's default, so the backfill's existence check is proven to read the
 * schema the migrator bound.
 */
export function defineWriteIdentityMigrationCases(
  backend: string,
  open: () => Promise<MigrationTestDatabase>,
): void {
  describe(`migration 028 write identity [${backend}]`, () => {
    const schema = "write_identity_test";
    let database: MigrationTestDatabase | undefined;
    let db: Kysely<any>;

    const migrate = async (upTo?: string) => {
      const result = await runMigrations(database!.base, schema, upTo);
      if (!result.success) {
        throw result.error ?? new Error("migration failed");
      }
      return result;
    };

    const snapshot = async (seed: SnapshotSeed) => {
      await db
        .insertInto("DocumentSnapshot")
        .values({
          id: `${seed.documentId}-${seed.scope}-${seed.branch ?? "main"}`,
          documentId: seed.documentId,
          slug: seed.slug ?? null,
          name: null,
          scope: seed.scope,
          branch: seed.branch ?? "main",
          content: sql`'{}'::jsonb`,
          documentType: seed.documentType ?? "powerhouse/test",
          lastOperationIndex: 0,
          lastOperationHash: "h",
          isDeleted: seed.isDeleted ?? false,
        })
        .execute();
    };

    const slugMapping = async (
      slug: string,
      documentId: string,
      branch = "main",
    ) => {
      await db
        .insertInto("SlugMapping")
        .values({ slug, documentId, scope: "header", branch })
        .execute();
    };

    const identities = async (): Promise<IdentityRow[]> =>
      (await db
        .selectFrom("WriteIdentity")
        .selectAll()
        .orderBy("documentId")
        .orderBy("branch")
        .execute()) as IdentityRow[];

    beforeEach(async () => {
      const opened = await open();
      database = opened;
      db = opened.base.withSchema(schema);
    });

    afterEach(async () => {
      await database?.destroy();
    });

    it("creates an empty table on a fresh store", async () => {
      const result = await migrate();

      expect(result.migrationsExecuted).toContain("028_create_write_identity");
      expect(await identities()).toEqual([]);
    });

    it("backfills documents from header snapshots and slugs from SlugMapping", async () => {
      await migrate(BEFORE_WRITE_IDENTITY);

      await snapshot({ documentId: "doc-1", scope: "header", slug: "one" });
      await snapshot({ documentId: "doc-1", scope: "global", slug: "one" });
      await snapshot({ documentId: "doc-1", scope: "document", slug: "one" });
      await slugMapping("one", "doc-1");

      await snapshot({
        documentId: "doc-2",
        scope: "header",
        slug: "two",
        documentType: "powerhouse/document-drive",
        isDeleted: true,
      });

      await snapshot({ documentId: "doc-3", scope: "header", slug: "doc-3" });

      await snapshot({
        documentId: "doc-4",
        scope: "header",
        branch: "draft",
        slug: "four",
      });
      await slugMapping("four", "doc-4", "draft");

      await snapshot({ documentId: "doc-5", scope: "global", slug: "five" });

      await migrate();

      const rows = await identities();
      expect(
        rows.map((row) => ({
          documentId: row.documentId,
          branch: row.branch,
          slug: row.slug,
          documentType: row.documentType,
          isDeleted: row.isDeleted,
        })),
      ).toEqual([
        {
          documentId: "doc-1",
          branch: "main",
          slug: "one",
          documentType: "powerhouse/test",
          isDeleted: false,
        },
        {
          documentId: "doc-2",
          branch: "main",
          slug: null,
          documentType: "powerhouse/document-drive",
          isDeleted: true,
        },
        {
          documentId: "doc-3",
          branch: "main",
          slug: null,
          documentType: "powerhouse/test",
          isDeleted: false,
        },
        {
          documentId: "doc-4",
          branch: "draft",
          slug: "four",
          documentType: "powerhouse/test",
          isDeleted: false,
        },
      ]);
      for (const row of rows) {
        expect(Number.isNaN(Date.parse(row.createdAtUtcIso))).toBe(false);
        expect(row.updatedAtUtcIso).toBe(row.createdAtUtcIso);
      }
    });

    it("leaves the table unchanged when run a second time", async () => {
      await migrate(BEFORE_WRITE_IDENTITY);
      await snapshot({ documentId: "doc-1", scope: "header", slug: "one" });
      await slugMapping("one", "doc-1");
      await snapshot({ documentId: "doc-2", scope: "header" });
      await migrate();
      const before = await identities();

      await migration028.up(db);

      expect(await identities()).toEqual(before);
    });

    it("skips the backfill when the view tables are absent", async () => {
      await migrate(BEFORE_WRITE_IDENTITY);
      await db.schema.dropTable("SlugMapping").execute();
      await db.schema.dropTable("DocumentSnapshot").execute();

      await migrate();

      expect(await identities()).toEqual([]);
    });

    it("allows a slug once per branch and any number of null slugs", async () => {
      await migrate();
      const row = (
        documentId: string,
        branch: string,
        slug: string | null,
      ) => ({
        documentId,
        branch,
        slug,
        documentType: "powerhouse/test",
        createdAtUtcIso: "2026-01-01T00:00:00.000Z",
        updatedAtUtcIso: "2026-01-01T00:00:00.000Z",
      });

      await db
        .insertInto("WriteIdentity")
        .values([
          row("doc-1", "main", "shared"),
          row("doc-2", "draft", "shared"),
          row("doc-3", "main", null),
          row("doc-4", "main", null),
        ])
        .execute();

      await expect(
        db
          .insertInto("WriteIdentity")
          .values(row("doc-5", "main", "shared"))
          .execute(),
      ).rejects.toThrow(/idx_write_identity_slug_branch|unique/i);
    });
  });
}
