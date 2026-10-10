import type { Kysely } from "kysely";

/** A session remote's row exists so its cursors, holds and dead letters have a parent. */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .addColumn("persistence", "text", (col) =>
      col.notNull().defaultTo("durable"),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("sync_remotes")
    .dropColumn("persistence")
    .execute();
}
