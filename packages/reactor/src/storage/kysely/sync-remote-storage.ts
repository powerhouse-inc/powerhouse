import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RemoteRecord } from "../../sync/types.js";
import type { ISyncRemoteStorage } from "../interfaces.js";
import type { Database, InsertableSyncRemote, SyncRemoteRow } from "./types.js";

function rowToRemoteRecord(row: SyncRemoteRow): RemoteRecord {
  return {
    id: row.channel_id,
    name: row.name,
    collectionId: row.collection_id,
    channelConfig: {
      type: row.channel_type,
      parameters: (row.channel_parameters ?? {}) as Record<string, unknown>,
    },
    filter: {
      documentId: (row.filter_document_ids ?? []) as string[],
      scope: (row.filter_scopes ?? []) as string[],
      branch: row.filter_branch,
    },
    options: { sinceTimestampUtcMs: "0" },
    status: {
      push: {
        state: row.push_state as "idle" | "running" | "error",
        lastSuccessUtcMs: row.push_last_success_utc_ms
          ? new Date(row.push_last_success_utc_ms).getTime()
          : undefined,
        lastFailureUtcMs: row.push_last_failure_utc_ms
          ? new Date(row.push_last_failure_utc_ms).getTime()
          : undefined,
        failureCount: row.push_failure_count,
      },
      pull: {
        state: row.pull_state as "idle" | "running" | "error",
        lastSuccessUtcMs: row.pull_last_success_utc_ms
          ? new Date(row.pull_last_success_utc_ms).getTime()
          : undefined,
        lastFailureUtcMs: row.pull_last_failure_utc_ms
          ? new Date(row.pull_last_failure_utc_ms).getTime()
          : undefined,
        failureCount: row.pull_failure_count,
      },
    },
  };
}

function remoteRecordToRow(remote: RemoteRecord): InsertableSyncRemote {
  return {
    name: remote.name,
    collection_id: remote.collectionId,
    channel_type: remote.channelConfig.type,
    channel_id: remote.id,
    remote_name: remote.name,
    channel_parameters: JSON.stringify(remote.channelConfig.parameters),
    filter_document_ids:
      remote.filter.documentId.length > 0
        ? JSON.stringify(remote.filter.documentId)
        : null,
    filter_scopes:
      remote.filter.scope.length > 0
        ? JSON.stringify(remote.filter.scope)
        : null,
    filter_branch: remote.filter.branch,
    push_state: remote.status.push.state,
    push_last_success_utc_ms: remote.status.push.lastSuccessUtcMs
      ? new Date(remote.status.push.lastSuccessUtcMs).toISOString()
      : null,
    push_last_failure_utc_ms: remote.status.push.lastFailureUtcMs
      ? new Date(remote.status.push.lastFailureUtcMs).toISOString()
      : null,
    push_failure_count: remote.status.push.failureCount,
    pull_state: remote.status.pull.state,
    pull_last_success_utc_ms: remote.status.pull.lastSuccessUtcMs
      ? new Date(remote.status.pull.lastSuccessUtcMs).toISOString()
      : null,
    pull_last_failure_utc_ms: remote.status.pull.lastFailureUtcMs
      ? new Date(remote.status.pull.lastFailureUtcMs).toISOString()
      : null,
    pull_failure_count: remote.status.pull.failureCount,
  };
}

export class KyselySyncRemoteStorage implements ISyncRemoteStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(signal?: AbortSignal): Promise<RemoteRecord[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db.selectFrom("sync_remotes").selectAll().execute();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    return rows.map(rowToRemoteRecord);
  }

  async get(name: string, signal?: AbortSignal): Promise<RemoteRecord> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_remotes")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (!row) {
      throw new Error(`Remote not found: ${name}`);
    }

    return rowToRemoteRecord(row);
  }

  async upsert(remote: RemoteRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      const insertable = remoteRecordToRow(remote);

      await trx
        .insertInto("sync_remotes")
        .values(insertable)
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({
            ...insertable,
            updated_at: sql`NOW()`,
          }),
        )
        .execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }

  async remove(name: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("sync_remotes").where("name", "=", name).execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }
}
