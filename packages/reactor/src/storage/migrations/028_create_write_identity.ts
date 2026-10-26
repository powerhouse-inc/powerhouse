import { SelectQueryNode, TableNode, sql } from "kysely";
import type { Kysely } from "kysely";

/**
 * The write side's own identity table: which document a slug or id names on a
 * branch, and its document type. Mutations resolve their targets and run their
 * pre-checks against it, so the write path no longer reads the document view.
 *
 * `slug` holds only a resolvable slug: null when the header slug is empty or
 * equals the id, and null for a deleted document, whose slug is free for
 * another document to claim (the view drops its SlugMapping rows the same way).
 *
 * The backfill copies the view's identity at migrate time: header snapshot
 * rows give the documents and their types, SlugMapping gives the slugs. A
 * document the view had not yet indexed is not backfilled; its next
 * identity-changing operation writes the row. Every statement is safe to run
 * again.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("WriteIdentity")
    .ifNotExists()
    .addColumn("documentId", "text", (col) => col.notNull())
    .addColumn("branch", "text", (col) => col.notNull())
    .addColumn("slug", "text")
    .addColumn("documentType", "text", (col) => col.notNull())
    .addColumn("isDeleted", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("createdAtUtcIso", "text", (col) => col.notNull())
    .addColumn("updatedAtUtcIso", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("WriteIdentity_pkey", ["documentId", "branch"])
    .execute();

  await db.schema
    .createIndex("idx_write_identity_slug_branch")
    .ifNotExists()
    .unique()
    .on("WriteIdentity")
    .columns(["slug", "branch"])
    .where(sql.ref("slug"), "is not", null)
    .execute();

  await db.schema
    .createIndex("idx_write_identity_document_type")
    .ifNotExists()
    .on("WriteIdentity")
    .column("documentType")
    .execute();

  const schema = schemaOf(db);
  const now = new Date().toISOString();

  if (await tableExists(db, schema, "DocumentSnapshot")) {
    await db
      .insertInto("WriteIdentity")
      .columns([
        "documentId",
        "branch",
        "slug",
        "documentType",
        "isDeleted",
        "createdAtUtcIso",
        "updatedAtUtcIso",
      ])
      .expression(
        db
          .selectFrom("DocumentSnapshot")
          .select([
            "documentId",
            "branch",
            sql<null>`null`.as("slug"),
            "documentType",
            "isDeleted",
            sql<string>`${now}::text`.as("createdAtUtcIso"),
            sql<string>`${now}::text`.as("updatedAtUtcIso"),
          ])
          .where("scope", "=", "header"),
      )
      .onConflict((oc) => oc.columns(["documentId", "branch"]).doNothing())
      .execute();
  }

  if (await tableExists(db, schema, "SlugMapping")) {
    await db
      .updateTable("WriteIdentity as wi")
      .from("SlugMapping as sm")
      .set({ slug: sql.ref("sm.slug"), updatedAtUtcIso: now })
      .whereRef("sm.documentId", "=", "wi.documentId")
      .whereRef("sm.branch", "=", "wi.branch")
      .where("sm.scope", "=", "header")
      .whereRef("sm.slug", "<>", "wi.documentId")
      .where("wi.slug", "is", null)
      .where("wi.isDeleted", "=", false)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("WriteIdentity as other")
              .select("other.documentId")
              .whereRef("other.slug", "=", "sm.slug")
              .whereRef("other.branch", "=", "sm.branch"),
          ),
        ),
      )
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("WriteIdentity").ifExists().execute();
}

/**
 * The schema the migrator bound `db` to. Raw SQL is not schema-qualified by
 * `withSchema`, so the existence check reads it off a compiled query.
 */
function schemaOf(db: Kysely<any>): string {
  const { query } = db.selectFrom("WriteIdentity").selectAll().compile();
  const from = SelectQueryNode.is(query) ? query.from?.froms[0] : undefined;
  const name = from && TableNode.is(from) ? from.table.schema?.name : undefined;
  return name ?? "public";
}

async function tableExists(
  db: Kysely<any>,
  schema: string,
  table: string,
): Promise<boolean> {
  const result = await sql<{ found: number }>`
    select 1 as found
    from information_schema.tables
    where table_schema = ${schema} and table_name = ${table}
  `.execute(db);
  return result.rows.length > 0;
}
