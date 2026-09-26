import type { Kysely } from "kysely";
import type { ISyncHoldStorage, SyncHoldRecord } from "../interfaces.js";
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
    await this.db
      .insertInto("sync_holds")
      .values(row)
      .onConflict((oc) =>
        oc
          .columns(["remote_name", "document_id", "branch"])
          .doUpdateSet({ protocol: row.protocol, version: row.version }),
      )
      .execute();
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
