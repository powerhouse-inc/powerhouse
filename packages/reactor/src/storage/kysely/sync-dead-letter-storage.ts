import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { PagingOptions, PagedResults } from "../../shared/types.js";
import type {
  ChannelErrorSource,
  SyncOperationErrorType,
} from "../../sync/types.js";
import { quarantinesDocument } from "../../sync/utils.js";
import type { DeadLetterRecord } from "../interfaces.js";
import type { ISyncDeadLetterStorage } from "../interfaces.js";
import { notPurged } from "./document-purge-gate.js";
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
    // Coalesced as well as defaulted, so a pre-existing row rehydrates either way.
    errorType: (row.error_type ?? "UNCLASSIFIED") as SyncOperationErrorType,
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
    error_type: record.errorType,
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
        .columns([
          "id",
          "job_id",
          "job_dependencies",
          "remote_name",
          "document_id",
          "scopes",
          "branch",
          "operations",
          "error_source",
          "error_message",
          "error_type",
        ])
        .expression(
          trx
            .selectNoFrom([
              sql<string>`${insertable.id}::text`.as("id"),
              sql<string>`${insertable.job_id}::text`.as("job_id"),
              sql<unknown>`${insertable.job_dependencies}::jsonb`.as(
                "job_dependencies",
              ),
              sql<string>`${insertable.remote_name}::text`.as("remote_name"),
              sql<string>`${insertable.document_id}::text`.as("document_id"),
              sql<unknown>`${insertable.scopes}::jsonb`.as("scopes"),
              sql<string>`${insertable.branch}::text`.as("branch"),
              sql<unknown>`${insertable.operations}::jsonb`.as("operations"),
              sql<string>`${insertable.error_source}::text`.as("error_source"),
              sql<string>`${insertable.error_message}::text`.as(
                "error_message",
              ),
              sql<string>`${insertable.error_type}::text`.as("error_type"),
            ])
            .where((eb) => notPurged(eb, insertable.document_id)),
        )
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

  async listQuarantinedDocumentIds(signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("sync_dead_letters")
      .select(["document_id", "error_type"])
      .distinct()
      .execute();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // A document whose only dead letters are held auth operations keeps syncing
    // across a restart too.
    const quarantined = new Set<string>();
    for (const row of rows) {
      const errorType = (row.error_type ??
        "UNCLASSIFIED") as SyncOperationErrorType;
      if (quarantinesDocument(errorType)) {
        quarantined.add(row.document_id);
      }
    }

    return [...quarantined];
  }
}
