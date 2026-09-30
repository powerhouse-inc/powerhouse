import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import type {
  ISyncReceivedMarkerStorage,
  ReceivedMarkerRecord,
} from "../interfaces.js";
import type { Database } from "./types.js";

export class KyselySyncReceivedMarkerStorage implements ISyncReceivedMarkerStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(remoteName: string): Promise<ReceivedMarkerRecord[]> {
    const rows = await this.db
      .selectFrom("sync_received_markers")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .orderBy("received_at_utc_ms")
      .execute();
    return rows.map((row) => ({
      remoteName: row.remote_name,
      markerId: row.marker_id,
      documentId: row.document_id,
      branch: row.branch,
      operation: row.operation as OperationWithContext,
      receivedAtUtcMs: Number(row.received_at_utc_ms),
    }));
  }

  async upsert(record: ReceivedMarkerRecord): Promise<void> {
    await this.db
      .insertInto("sync_received_markers")
      .values({
        remote_name: record.remoteName,
        marker_id: record.markerId,
        document_id: record.documentId,
        branch: record.branch,
        operation: JSON.stringify(record.operation),
        received_at_utc_ms: record.receivedAtUtcMs,
      })
      .onConflict((oc) => oc.columns(["remote_name", "marker_id"]).doNothing())
      .execute();
  }

  async remove(remoteName: string, markerId: string): Promise<void> {
    await this.db
      .deleteFrom("sync_received_markers")
      .where("remote_name", "=", remoteName)
      .where("marker_id", "=", markerId)
      .execute();
  }

  async removeRemote(remoteName: string): Promise<void> {
    await this.db
      .deleteFrom("sync_received_markers")
      .where("remote_name", "=", remoteName)
      .execute();
  }
}
