import { DOCUMENT_PURGE_PROTOCOL } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { DocumentPurgedError } from "../../shared/errors.js";
import type { ISyncHoldStorage, SyncHoldRecord } from "../interfaces.js";
import { acquirePurgeLocks, findPurged } from "./document-purges.js";
import type { Database } from "./types.js";

export class KyselySyncHoldStorage implements ISyncHoldStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    filter: { remoteName?: string; documentId?: string } = {},
  ): Promise<SyncHoldRecord[]> {
    let query = this.db.selectFrom("sync_holds").selectAll();
    if (filter.remoteName !== undefined) {
      query = query.where("remote_name", "=", filter.remoteName);
    }
    if (filter.documentId !== undefined) {
      query = query.where("document_id", "=", filter.documentId);
    }
    const rows = await query.orderBy("held_at_utc_ms").execute();
    return rows.map((row) => ({
      remoteName: row.remote_name,
      documentId: row.document_id,
      branch: row.branch,
      protocol: row.protocol,
      version: row.version,
      heldAtUtcMs: Number(row.held_at_utc_ms),
    }));
  }

  async upsert(hold: SyncHoldRecord): Promise<void> {
    const row = {
      remote_name: hold.remoteName,
      document_id: hold.documentId,
      branch: hold.branch,
      protocol: hold.protocol,
      version: hold.version,
      held_at_utc_ms: hold.heldAtUtcMs,
    };
    // A purge deleted the id's holds; only its marker may earn one after.
    await this.db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, [hold.documentId], "shared");
      if (hold.protocol !== DOCUMENT_PURGE_PROTOCOL) {
        const purged = await findPurged(trx, [hold.documentId]);
        if (purged.size > 0) throw new DocumentPurgedError(hold.documentId);
      }
      await trx
        .insertInto("sync_holds")
        .values(row)
        .onConflict((oc) =>
          oc
            .columns(["remote_name", "document_id", "branch"])
            .doUpdateSet({ protocol: row.protocol, version: row.version }),
        )
        .execute();
    });
  }

  async remove(
    remoteName: string,
    documentId: string,
    branch: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("sync_holds")
      .where("remote_name", "=", remoteName)
      .where("document_id", "=", documentId)
      .where("branch", "=", branch)
      .execute();
  }

  async removeRemote(remoteName: string): Promise<void> {
    await this.db
      .deleteFrom("sync_holds")
      .where("remote_name", "=", remoteName)
      .execute();
  }
}
