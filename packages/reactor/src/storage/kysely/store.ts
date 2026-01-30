import { type Operation } from "document-model";
import { sql, type Kysely } from "kysely";
import type { PagedResults, PagingOptions } from "../../shared/types.js";
import {
  DuplicateOperationError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentRevisions,
  type IOperationStore,
  type OperationFilter,
  type OperationWithContext,
} from "../interfaces.js";
import { AtomicTransaction } from "../txn.js";
import type { Database, OperationRow } from "./types.js";

export class KyselyOperationStore implements IOperationStore {
  constructor(private db: Kysely<Database>) {}

  async apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Check for abort signal
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }

      // Get the latest operation for this stream to verify revision
      const latestOp = await trx
        .selectFrom("Operation")
        .selectAll()
        .where("documentId", "=", documentId)
        .where("scope", "=", scope)
        .where("branch", "=", branch)
        .orderBy("index", "desc")
        .limit(1)
        .executeTakeFirst();

      // Check revision matches
      const currentRevision = latestOp ? latestOp.index : -1;
      if (currentRevision !== revision - 1) {
        throw new RevisionMismatchError(currentRevision + 1, revision);
      }

      // Create atomic transaction
      const atomicTxn = new AtomicTransaction(
        documentId,
        documentType,
        scope,
        branch,
        revision,
      );
      await fn(atomicTxn);

      // Get operations and header updates
      const operations = atomicTxn.getOperations();

      // Insert operations
      if (operations.length > 0) {
        // Set prevOpId for each operation
        let prevOpId = latestOp?.opId || "";
        for (const op of operations) {
          op.prevOpId = prevOpId;
          prevOpId = op.opId;
        }

        try {
          await trx.insertInto("Operation").values(operations).execute();
        } catch (error: unknown) {
          if (error instanceof Error) {
            if (error.message.includes("unique constraint")) {
              const op = operations[0];
              throw new DuplicateOperationError(
                `${op.opId} at index ${op.index} with skip ${op.skip}`,
              );
            }

            throw error;
          }

          throw error;
        }
      }
    });
  }

  async getSince(
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    filter?: OperationFilter,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("index", ">", revision)
      .orderBy("index", "asc");

    if (filter) {
      if (filter.actionTypes && filter.actionTypes.length > 0) {
        const actionTypesArray = filter.actionTypes
          .map((t) => `'${t.replace(/'/g, "''")}'`)
          .join(",");
        query = query.where(
          sql<boolean>`action->>'type' = ANY(ARRAY[${sql.raw(actionTypesArray)}]::text[])`,
        );
      }
      if (filter.timestampFrom) {
        query = query.where(
          "timestampUtcMs",
          ">=",
          new Date(filter.timestampFrom),
        );
      }
      if (filter.timestampTo) {
        query = query.where(
          "timestampUtcMs",
          "<=",
          new Date(filter.timestampTo),
        );
      }
      if (filter.sinceRevision !== undefined) {
        query = query.where("index", ">=", filter.sinceRevision);
      }
    }

    if (paging) {
      const cursorValue = Number.parseInt(paging.cursor, 10);
      if (cursorValue > 0) {
        query = query.where("index", ">", cursorValue);
      }

      if (paging.limit) {
        query = query.limit(paging.limit + 1);
      }
    }

    const rows = await query.execute();

    let hasMore = false;
    let items = rows;

    if (paging?.limit && rows.length > paging.limit) {
      hasMore = true;
      items = rows.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].index.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const limit = paging?.limit || 100;
    const operations = items.map((row) => this.rowToOperation(row));

    return {
      results: operations,
      options: { cursor, limit },
      nextCursor,
      next: hasMore
        ? () =>
            this.getSince(
              documentId,
              scope,
              branch,
              revision,
              filter,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    };
  }

  async getSinceId(
    id: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("Operation")
      .selectAll()
      .where("id", ">", id)
      .orderBy("id", "asc");

    // Handle cursor-based pagination
    if (paging) {
      // Cursor encodes the last seen id
      const cursorValue = Number.parseInt(paging.cursor, 10);
      if (cursorValue > 0) {
        query = query.where("id", ">", cursorValue);
      }

      // Apply limit if specified (fetch one extra to determine hasMore)
      if (paging.limit) {
        query = query.limit(paging.limit + 1);
      }
    }

    const rows = await query.execute();

    // Determine if there are more results
    let hasMore = false;
    let items = rows;

    if (paging?.limit && rows.length > paging.limit) {
      hasMore = true;
      items = rows.slice(0, paging.limit);
    }

    // Generate next cursor from last item's id
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].id.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const limit = paging?.limit || 100;
    const operations = items.map((row) => this.rowToOperationWithContext(row));

    return {
      results: operations,
      options: { cursor, limit },
      nextCursor,
      next: hasMore
        ? () => this.getSinceId(id, { cursor: nextCursor!, limit }, signal)
        : undefined,
    };
  }

  async getConflicting(
    documentId: string,
    scope: string,
    branch: string,
    minTimestamp: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    let query = this.db
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("timestampUtcMs", ">=", new Date(minTimestamp))
      .orderBy("index", "asc");

    if (paging) {
      const cursorValue = Number.parseInt(paging.cursor, 10);
      if (cursorValue > 0) {
        query = query.where("index", ">", cursorValue);
      }

      if (paging.limit) {
        query = query.limit(paging.limit + 1);
      }
    }

    const rows = await query.execute();

    let hasMore = false;
    let items = rows;

    if (paging?.limit && rows.length > paging.limit) {
      hasMore = true;
      items = rows.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].index.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const limit = paging?.limit || 100;
    const operations = items.map((row) => this.rowToOperation(row));

    return {
      results: operations,
      options: { cursor, limit },
      nextCursor,
      next: hasMore
        ? () =>
            this.getConflicting(
              documentId,
              scope,
              branch,
              minTimestamp,
              { cursor: nextCursor!, limit },
              signal,
            )
        : undefined,
    };
  }

  async getRevisions(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<DocumentRevisions> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Get the latest operation for each scope in a single query
    // Uses a subquery to find operations where the index equals the max index for that scope
    const scopeRevisions = await this.db
      .selectFrom("Operation as o1")
      .select(["o1.scope", "o1.index", "o1.timestampUtcMs"])
      .where("o1.documentId", "=", documentId)
      .where("o1.branch", "=", branch)
      .where((eb) =>
        eb(
          "o1.index",
          "=",
          eb
            .selectFrom("Operation as o2")
            .select((eb2) => eb2.fn.max("o2.index").as("maxIndex"))
            .where("o2.documentId", "=", eb.ref("o1.documentId"))
            .where("o2.branch", "=", eb.ref("o1.branch"))
            .where("o2.scope", "=", eb.ref("o1.scope")),
        ),
      )
      .execute();

    const revision: Record<string, number> = {};
    let latestTimestamp = new Date(0).toISOString();

    for (const row of scopeRevisions) {
      revision[row.scope] = row.index + 1;
      const timestamp = row.timestampUtcMs.toISOString();
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
      }
    }

    return {
      revision,
      latestTimestamp,
    };
  }

  private rowToOperation(row: OperationRow): Operation {
    return {
      index: row.index,
      timestampUtcMs: row.timestampUtcMs.toISOString(),
      hash: row.hash,
      skip: row.skip,
      error: row.error || undefined,
      id: row.opId,
      action: row.action as Operation["action"],
    };
  }

  private rowToOperationWithContext(row: OperationRow): OperationWithContext {
    return {
      operation: this.rowToOperation(row),
      context: {
        documentId: row.documentId,
        documentType: row.documentType,
        scope: row.scope,
        branch: row.branch,
        ordinal: row.id,
      },
    };
  }
}
