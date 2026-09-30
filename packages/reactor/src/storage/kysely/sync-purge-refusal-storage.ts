import type { Kysely } from "kysely";
import type {
  ISyncPurgeRefusalStorage,
  PurgeRefusalRecord,
} from "../interfaces.js";
import type { Database } from "./types.js";

export class KyselySyncPurgeRefusalStorage implements ISyncPurgeRefusalStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(documentId: string): Promise<PurgeRefusalRecord[]> {
    const rows = await this.db
      .selectFrom("sync_purge_refusals")
      .selectAll()
      .where("document_id", "=", documentId)
      .orderBy("refused_at_utc_ms")
      .orderBy("remote_name")
      .execute();
    return rows.map((row) => ({
      remoteName: row.remote_name,
      documentId: row.document_id,
      branch: row.branch,
      refusedAtUtcMs: Number(row.refused_at_utc_ms),
    }));
  }

  async record(refusal: PurgeRefusalRecord): Promise<void> {
    await this.db
      .insertInto("sync_purge_refusals")
      .values({
        remote_name: refusal.remoteName,
        document_id: refusal.documentId,
        branch: refusal.branch,
        refused_at_utc_ms: refusal.refusedAtUtcMs,
      })
      .onConflict((oc) =>
        oc.columns(["remote_name", "document_id", "branch"]).doNothing(),
      )
      .execute();
  }
}
