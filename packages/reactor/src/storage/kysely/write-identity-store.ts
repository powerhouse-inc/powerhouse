import type { Kysely, Selectable, Transaction } from "kysely";
import type {
  IWriteIdentityStore,
  WriteIdentityRecord,
  WriteIdentityUpsert,
} from "../interfaces.js";
import type { Database, WriteIdentityTable } from "./types.js";

export class KyselyWriteIdentityStore implements IWriteIdentityStore {
  private trx?: Transaction<Database>;

  constructor(private db: Kysely<Database>) {}

  withTransaction(trx: Transaction<Database>): KyselyWriteIdentityStore {
    const instance = new KyselyWriteIdentityStore(this.db);
    instance.trx = trx;
    return instance;
  }

  async upsert(rows: WriteIdentityUpsert[]): Promise<void> {
    if (rows.length === 0) return;
    if (this.trx) {
      await this.upsertIn(this.trx, rows);
      return;
    }
    await this.db.transaction().execute((trx) => this.upsertIn(trx, rows));
  }

  async resolve(
    identifier: string,
    branch: string,
  ): Promise<WriteIdentityRecord | undefined> {
    const rows = await this.queryExecutor
      .selectFrom("WriteIdentity")
      .selectAll()
      .where("branch", "=", branch)
      .where((eb) =>
        eb.or([eb("documentId", "=", identifier), eb("slug", "=", identifier)]),
      )
      .execute();

    const idMatch = rows.find((row) => row.documentId === identifier);
    const slugMatch = rows.find((row) => row.slug === identifier);

    if (idMatch && slugMatch && idMatch.documentId !== slugMatch.documentId) {
      throw new Error(
        `Ambiguous identifier "${identifier}": matches both document ID "${idMatch.documentId}" and slug for document ID "${slugMatch.documentId}". ` +
          `Please use get() for ID or resolveSlug() + get() for slug to be explicit.`,
      );
    }

    const match = idMatch ?? slugMatch;
    return match ? toRecord(match) : undefined;
  }

  async describe(
    documentId: string,
    branch: string,
  ): Promise<WriteIdentityRecord | undefined> {
    const row = await this.queryExecutor
      .selectFrom("WriteIdentity")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("branch", "=", branch)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  async delete(documentId: string): Promise<void> {
    await this.queryExecutor
      .deleteFrom("WriteIdentity")
      .where("documentId", "=", documentId)
      .execute();
  }

  private get queryExecutor(): Kysely<Database> | Transaction<Database> {
    return this.trx ?? this.db;
  }

  /**
   * A slug is unique per branch, and the last document to claim it keeps it,
   * as the view's SlugMapping upsert does: the claim first clears the slug
   * from any other document on the branch.
   */
  private async upsertIn(
    trx: Transaction<Database>,
    rows: WriteIdentityUpsert[],
  ): Promise<void> {
    const now = new Date().toISOString();
    for (const row of rows) {
      if (row.slug !== null) {
        await trx
          .updateTable("WriteIdentity")
          .set({ slug: null, updatedAtUtcIso: now })
          .where("slug", "=", row.slug)
          .where("branch", "=", row.branch)
          .where("documentId", "<>", row.documentId)
          .execute();
      }

      await trx
        .insertInto("WriteIdentity")
        .values({
          documentId: row.documentId,
          branch: row.branch,
          slug: row.slug,
          documentType: row.documentType,
          isDeleted: row.isDeleted,
          createdAtUtcIso: now,
          updatedAtUtcIso: now,
        })
        .onConflict((oc) =>
          oc.columns(["documentId", "branch"]).doUpdateSet({
            slug: row.slug,
            documentType: row.documentType,
            isDeleted: row.isDeleted,
            updatedAtUtcIso: now,
          }),
        )
        .execute();
    }
  }
}

function toRecord(row: Selectable<WriteIdentityTable>): WriteIdentityRecord {
  return {
    documentId: row.documentId,
    branch: row.branch,
    slug: row.slug,
    documentType: row.documentType,
    isDeleted: row.isDeleted,
    createdAtUtcIso: row.createdAtUtcIso,
    updatedAtUtcIso: row.updatedAtUtcIso,
  };
}
