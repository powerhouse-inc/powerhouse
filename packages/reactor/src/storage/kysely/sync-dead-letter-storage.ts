import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import type { PagingOptions, PagedResults } from "../../shared/types.js";
import type { ChannelErrorSource } from "../../sync/types.js";
import type { DeadLetterRecord } from "../interfaces.js";
import type { ISyncDeadLetterStorage } from "../interfaces.js";
import type {
  Database,
  InsertableSyncDeadLetter,
  SyncDeadLetterRow,
} from "./types.js";

function rowToDeadLetterRecord(row: SyncDeadLetterRow): DeadLetterRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    jobDependencies: row.job_dependencies as string[],
    remoteName: row.remote_name,
    documentId: row.document_id,
    scopes: row.scopes as string[],
    branch: row.branch,
    operations: row.operations as OperationWithContext[],
    errorSource: row.error_source as ChannelErrorSource,
    errorMessage: row.error_message,
  };
}

function deadLetterRecordToRow(
  record: DeadLetterRecord,
): InsertableSyncDeadLetter {
  return {
    id: record.id,
    job_id: record.jobId,
    job_dependencies: JSON.stringify(record.jobDependencies),
    remote_name: record.remoteName,
    document_id: record.documentId,
    scopes: JSON.stringify(record.scopes),
    branch: record.branch,
    operations: JSON.stringify(record.operations),
    error_source: record.errorSource,
    error_message: record.errorMessage,
  };
}

/**
 * PGlite/Kysely-backed implementation of {@link ISyncDeadLetterStorage}.
 */
export class KyselySyncDeadLetterStorage implements ISyncDeadLetterStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    remoteName: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<DeadLetterRecord>> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const startIndex = paging?.cursor ? parseInt(paging.cursor) : 0;
    const limit = paging?.limit || 100;

    const rows = await this.db
      .selectFrom("sync_dead_letters")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .orderBy("ordinal", "desc")
      .offset(startIndex)
      .limit(limit + 1)
      .execute();

    let hasMore = false;
    let items = rows;
    if (paging?.limit && rows.length > limit) {
      hasMore = true;
      items = rows.slice(0, limit);
    }

    const nextCursor = hasMore ? String(startIndex + limit) : undefined;
    const cursor = paging?.cursor || "0";

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    return {
      results: items.map(rowToDeadLetterRecord),
      options: { cursor, limit },
      nextCursor,
    };
  }

  async add(deadLetter: DeadLetterRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      const insertable = deadLetterRecordToRow(deadLetter);

      await trx
        .insertInto("sync_dead_letters")
        .values(insertable)
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }

  async remove(id: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("sync_dead_letters").where("id", "=", id).execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }

  async removeByRemote(
    remoteName: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_dead_letters")
        .where("remote_name", "=", remoteName)
        .execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }
}
