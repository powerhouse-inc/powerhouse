import {
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import type { PagedResults, PagingOptions } from "../../shared/types.js";
import { throwIfAborted } from "../../shared/utils.js";
import { paginateRows } from "./pagination.js";
import {
  DuplicateOperationError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentRevisions,
  type IOperationStore,
  type OperationFilter,
} from "../interfaces.js";
import { AtomicTransaction } from "../txn.js";
import type { Database, InsertableOperation, OperationRow } from "./types.js";

class _UniqueConstraintContext {
  constructor(
    readonly documentId: string,
    readonly scope: string,
    readonly branch: string,
    readonly revision: number,
    readonly stagedOps: InsertableOperation[],
  ) {}
}

export class KyselyOperationStore implements IOperationStore {
  private trx?: Transaction<Database>;

  constructor(private db: Kysely<Database>) {}

  private get queryExecutor(): Kysely<Database> | Transaction<Database> {
    return this.trx ?? this.db;
  }

  withTransaction(trx: Transaction<Database>): KyselyOperationStore {
    const instance = new KyselyOperationStore(this.db);
    instance.trx = trx;
    return instance;
  }

  async apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    if (this.trx) {
      let executeResult: Operation[] | null = null;
      let uniqueCtx: _UniqueConstraintContext | null = null;

      try {
        executeResult = await this.executeApply(
          this.trx,
          documentId,
          documentType,
          scope,
          branch,
          revision,
          fn,
          signal,
        );
      } catch (error) {
        if (error instanceof _UniqueConstraintContext) {
          uniqueCtx = error;
        } else {
          throw error;
        }
      }

      if (uniqueCtx !== null) {
        return this.resolveUniqueConstraint(uniqueCtx);
      }

      return executeResult!;
    } else {
      let transactionResult: Operation[] | null = null;
      let uniqueCtx: _UniqueConstraintContext | null = null;

      try {
        transactionResult = await this.db.transaction().execute(async (trx) => {
          return this.executeApply(
            trx,
            documentId,
            documentType,
            scope,
            branch,
            revision,
            fn,
            signal,
          );
        });
      } catch (error) {
        if (error instanceof _UniqueConstraintContext) {
          uniqueCtx = error;
        } else {
          throw error;
        }
      }

      if (uniqueCtx !== null) {
        return this.resolveUniqueConstraint(uniqueCtx);
      }

      return transactionResult!;
    }
  }

  private async resolveUniqueConstraint(
    ctx: _UniqueConstraintContext,
  ): Promise<Operation[]> {
    let replayOps: Operation[] | null = null;

    try {
      replayOps = await this.findIdempotentReplay(
        this.db,
        ctx.documentId,
        ctx.scope,
        ctx.branch,
        ctx.revision,
        ctx.stagedOps,
      );
    } catch {
      // Lookup failed; propagate original error below
    }

    if (replayOps !== null) {
      return replayOps;
    }

    const op = ctx.stagedOps[0];
    throw new DuplicateOperationError(
      `${op.opId} at index ${op.index} with skip ${op.skip}`,
    );
  }

  private async executeApply(
    trx: Transaction<Database>,
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<Operation[]> {
    throwIfAborted(signal);

    const atomicTxn = new AtomicTransaction(
      documentId,
      documentType,
      scope,
      branch,
      revision,
    );

    await fn(atomicTxn);

    const operations = atomicTxn.getOperations();

    if (operations.length === 0) {
      return [];
    }

    const latestOp = await trx
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .orderBy("index", "desc")
      .limit(1)
      .executeTakeFirst();

    const currentRevision = latestOp ? latestOp.index : -1;
    if (currentRevision !== revision - 1) {
      let replayOps: Operation[] | null = null;

      try {
        replayOps = await this.findIdempotentReplay(
          trx,
          documentId,
          scope,
          branch,
          revision,
          operations,
        );
      } catch {
        // Lookup failed; propagate original error below
      }

      if (replayOps !== null) {
        return replayOps;
      }

      throw new RevisionMismatchError(currentRevision + 1, revision);
    }

    let prevOpId = latestOp?.opId || "";
    for (const op of operations) {
      op.prevOpId = prevOpId;
      prevOpId = op.opId;
    }

    try {
      await trx.insertInto("Operation").values(operations).execute();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        throw new _UniqueConstraintContext(
          documentId,
          scope,
          branch,
          revision,
          operations,
        );
      }

      throw error;
    }

    return operations.map((op) => ({
      index: op.index,
      timestampUtcMs: op.timestampUtcMs.toISOString(),
      hash: op.hash,
      skip: op.skip,
      error: op.error || undefined,
      id: op.opId,
      action: JSON.parse(op.action as string) as Operation["action"],
    }));
  }

  private async findIdempotentReplay(
    executor: Kysely<Database> | Transaction<Database>,
    documentId: string,
    scope: string,
    branch: string,
    revision: number,
    stagedOps: InsertableOperation[],
  ): Promise<Operation[] | null> {
    const minIndex = revision;
    const maxIndex = revision + stagedOps.length - 1;

    const storedRows = await executor
      .selectFrom("Operation")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .where("branch", "=", branch)
      .where("index", ">=", minIndex)
      .where("index", "<=", maxIndex)
      .orderBy("index", "asc")
      .execute();

    if (storedRows.length !== stagedOps.length) {
      return null;
    }

    for (let i = 0; i < stagedOps.length; i++) {
      const staged = stagedOps[i];
      const stored = storedRows[i];
      if (
        stored.opId !== staged.opId ||
        stored.index !== staged.index ||
        stored.skip !== staged.skip
      ) {
        return null;
      }
    }

    return storedRows.map((row) => this.rowToOperation(row));
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
    throwIfAborted(signal);

    let query = this.queryExecutor
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

    return paginateRows(
      rows,
      paging,
      (row) => row.index,
      (row) => this.rowToOperation(row),
      (cursor, limit) =>
        this.getSince(
          documentId,
          scope,
          branch,
          revision,
          filter,
          { cursor, limit },
          signal,
        ),
    );
  }

  async getSinceId(
    id: number,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<OperationWithContext>> {
    throwIfAborted(signal);

    let query = this.queryExecutor
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

    return paginateRows(
      rows,
      paging,
      (row) => row.id,
      (row) => this.rowToOperationWithContext(row),
      (cursor, limit) => this.getSinceId(id, { cursor, limit }, signal),
    );
  }

  async getConflicting(
    documentId: string,
    scope: string,
    branch: string,
    minTimestamp: string,
    paging?: PagingOptions,
    signal?: AbortSignal,
  ): Promise<PagedResults<Operation>> {
    throwIfAborted(signal);

    let query = this.queryExecutor
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

    return paginateRows(
      rows,
      paging,
      (row) => row.index,
      (row) => this.rowToOperation(row),
      (cursor, limit) =>
        this.getConflicting(
          documentId,
          scope,
          branch,
          minTimestamp,
          { cursor, limit },
          signal,
        ),
    );
  }

  async getRevisions(
    documentId: string,
    branch: string,
    signal?: AbortSignal,
  ): Promise<DocumentRevisions> {
    throwIfAborted(signal);

    // Get the latest operation for each scope in a single query
    // Uses a subquery to find operations where the index equals the max index for that scope
    const scopeRevisions = await this.queryExecutor
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
