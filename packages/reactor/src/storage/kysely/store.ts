import { type Operation } from "document-model";
import type { Kysely } from "kysely";
import {
  DuplicateOperationError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentRevisions,
  type IOperationStore,
  type OperationWithContext,
  type PagedResults,
  type PagingOptions,
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
        throw new RevisionMismatchError(revision - 1, currentRevision);
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
        } catch (error: any) {
          if (error instanceof Error) {
            if (error.message.includes("unique constraint")) {
              // Extract the opId from the error if possible
              const opId = operations[0]?.opId || "unknown";
              throw new DuplicateOperationError(opId);
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

    // Handle cursor-based pagination
    if (paging) {
      // Cursor encodes the last seen index
      if (paging.cursor) {
        const lastIndex = Number.parseInt(paging.cursor, 10);
        query = query.where("index", ">", lastIndex);
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

    // Generate next cursor from last item's index
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].index.toString()
        : undefined;

    return {
      items: items.map((row) => this.rowToOperation(row)),
      nextCursor,
      hasMore,
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
      if (paging.cursor) {
        const lastId = Number.parseInt(paging.cursor, 10);
        query = query.where("id", ">", lastId);
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

    return {
      items: items.map((row) => this.rowToOperationWithContext(row)),
      nextCursor,
      hasMore,
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
      action: JSON.parse(row.action) as Operation["action"],
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
      },
    };
  }
}
