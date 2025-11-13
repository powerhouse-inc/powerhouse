import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ISyncRemoteStorage } from "../interfaces.js";
import type {
  RemoteRecord,
  ChannelConfig,
  RemoteFilter,
  RemoteStatus,
} from "../../sync/types.js";
import type {
  Database,
  SyncRemoteRow,
  InsertableSyncRemote,
} from "./types.js";

function rowToRemoteRecord(row: SyncRemoteRow): RemoteRecord {
  return {
    name: row.name,
    collectionId: row.collectionId,
    channelConfig: {
      type: row.channelType,
      parameters: (row.channelParameters as Record<string, unknown>) ?? {},
    },
    filter: {
      documentId: (row.filterDocumentIds as string[]) ?? [],
      scope: (row.filterScopes as string[]) ?? [],
      branch: row.filterBranch,
    },
    options: {},
    status: {
      push: {
        state: row.pushState as "idle" | "running" | "error",
        lastSuccessUtcMs: row.pushLastSuccessUtcMs
          ? Number(row.pushLastSuccessUtcMs)
          : undefined,
        lastFailureUtcMs: row.pushLastFailureUtcMs
          ? Number(row.pushLastFailureUtcMs)
          : undefined,
        failureCount: row.pushFailureCount,
      },
      pull: {
        state: row.pullState as "idle" | "running" | "error",
        lastSuccessUtcMs: row.pullLastSuccessUtcMs
          ? Number(row.pullLastSuccessUtcMs)
          : undefined,
        lastFailureUtcMs: row.pullLastFailureUtcMs
          ? Number(row.pullLastFailureUtcMs)
          : undefined,
        failureCount: row.pullFailureCount,
      },
    },
  };
}

function remoteRecordToRow(remote: RemoteRecord): InsertableSyncRemote {
  return {
    name: remote.name,
    collectionId: remote.collectionId,
    channelType: remote.channelConfig.type,
    channelParameters: remote.channelConfig.parameters,
    filterDocumentIds:
      remote.filter.documentId.length > 0 ? remote.filter.documentId : null,
    filterScopes: remote.filter.scope.length > 0 ? remote.filter.scope : null,
    filterBranch: remote.filter.branch,
    pushState: remote.status.push.state,
    pushLastSuccessUtcMs: remote.status.push.lastSuccessUtcMs
      ? BigInt(remote.status.push.lastSuccessUtcMs)
      : null,
    pushLastFailureUtcMs: remote.status.push.lastFailureUtcMs
      ? BigInt(remote.status.push.lastFailureUtcMs)
      : null,
    pushFailureCount: remote.status.push.failureCount,
    pullState: remote.status.pull.state,
    pullLastSuccessUtcMs: remote.status.pull.lastSuccessUtcMs
      ? BigInt(remote.status.pull.lastSuccessUtcMs)
      : null,
    pullLastFailureUtcMs: remote.status.pull.lastFailureUtcMs
      ? BigInt(remote.status.pull.lastFailureUtcMs)
      : null,
    pullFailureCount: remote.status.pull.failureCount,
  };
}

export class KyselySyncRemoteStorage implements ISyncRemoteStorage {
  constructor(private db: Kysely<Database>) {}

  async list(signal?: AbortSignal): Promise<RemoteRecord[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("sync_remotes")
      .selectAll()
      .execute();

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
            updatedAt: sql`NOW()`,
          }),
        )
        .execute();
    });
  }

  async remove(name: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("sync_remotes").where("name", "=", name).execute();
    });
  }
}
