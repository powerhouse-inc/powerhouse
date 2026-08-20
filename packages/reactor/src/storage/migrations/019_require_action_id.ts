import { sql } from "kysely";
import type { Kysely } from "kysely";

/**
 * Makes an operation whose action carries no id physically unstorable.
 *
 * The id is not decoration: `deriveOperationId` hashes it into the operation id
 * and replay dedupes incoming operations by it, so an action without one
 * collapses every id-less operation on a document/scope/branch onto a single
 * derived operation id. The API rejects such an action now, and this is the
 * last line of defense behind it.
 *
 * Both tables are constrained because sync reads operations from the index
 * rather than the operation table, so poison reaching only the index would
 * still be served to a replica.
 *
 * Pre-existing rows are backfilled rather than left behind a NOT VALID
 * constraint: a row the index and the operation table disagree about is worse
 * than a missing id, because dedup keys off the value each side serves. The
 * backfill therefore mints one id per operation and writes that same id to both
 * tables, joined on the identity they share. Rewriting the action is safe: the
 * operation hash is taken over the resulting state, not over the action, and a
 * signature is verified from the params carried in the signature tuple, which
 * do not include the action id.
 *
 * The empty string is rejected alongside null. It derives the same colliding
 * operation id as an absent id, so admitting it would leave the hole open.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Mint a fresh id per violating operation. `jsonb_typeof` guards `jsonb_set`,
  // which raises on a scalar rather than returning null.
  await db
    .updateTable("Operation")
    .set({
      action: sql`jsonb_set(action, '{id}', to_jsonb(gen_random_uuid()::text))`,
    })
    .where(
      sql<boolean>`jsonb_typeof(action) = 'object' and coalesce(action->>'id', '') = ''`,
    )
    .execute();

  // Carry the operation table's id into the index rather than minting a second
  // one: the two rows describe the same operation, and a replica dedupes
  // against whichever value it was served.
  await db
    .updateTable("operation_index_operations as oio")
    .from("Operation as op")
    .set({
      action: sql`jsonb_set(oio.action, '{id}', to_jsonb(op.action->>'id'))`,
    })
    .whereRef("oio.opId", "=", "op.opId")
    .whereRef("oio.index", "=", "op.index")
    .whereRef("oio.skip", "=", "op.skip")
    .where(
      sql<boolean>`jsonb_typeof(oio.action) = 'object' and coalesce(oio.action->>'id', '') = ''`,
    )
    .where(sql<boolean>`coalesce(op.action->>'id', '') <> ''`)
    .execute();

  // An index row the operation table never held has no id to inherit.
  await db
    .updateTable("operation_index_operations")
    .set({
      action: sql`jsonb_set(action, '{id}', to_jsonb(gen_random_uuid()::text))`,
    })
    .where(
      sql<boolean>`jsonb_typeof(action) = 'object' and coalesce(action->>'id', '') = ''`,
    )
    .execute();

  await db.schema
    .alterTable("Operation")
    .addCheckConstraint(
      "action_must_have_id",
      sql`action->>'id' is not null and action->>'id' <> ''`,
    )
    .execute();

  await db.schema
    .alterTable("operation_index_operations")
    .addCheckConstraint(
      "action_must_have_id",
      sql`action->>'id' is not null and action->>'id' <> ''`,
    )
    .execute();
}

/**
 * Only the constraints are dropped. The backfilled ids stay: they are the ids
 * their operations are now known by, and reverting them would reintroduce the
 * collision the migration removed.
 */
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("operation_index_operations")
    .dropConstraint("action_must_have_id")
    .execute();

  await db.schema
    .alterTable("Operation")
    .dropConstraint("action_must_have_id")
    .execute();
}
