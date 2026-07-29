import {
  type Operation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import type { PagedResults, PagingOptions } from "../../shared/types.js";
import { throwIfAborted } from "../../shared/utils.js";
import { paginateRows } from "./pagination.js";
import {
  AppendConditionFailedError,
  DuplicateOperationError,
  RevisionMismatchError,
  type AppendCondition,
  type AtomicTxn,
  type DocumentRevisions,
  type IOperationStore,
  type OperationFilter,
} from "../interfaces.js";
import { AtomicTransaction } from "../txn.js";
import type { Database, InsertableOperation, OperationRow } from "./types.js";

class _UniqueConstraintContext extends Error {
  constructor(
    readonly documentId: string,
    readonly scope: string,
    readonly branch: string,
    readonly revision: number,
    readonly stagedOps: InsertableOperation[],
  ) {
    super("unique constraint");
    this.name = "UniqueConstraintContext";
  }
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
    condition?: AppendCondition,
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
          condition,
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
            condition,
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
    condition?: AppendCondition,
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

    if (condition) {
      await this.acquireStreamLocks(trx, documentId, scope, branch, condition);
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

    let insertedCount = operations.length;
    try {
      if (condition && condition.streams.length > 0) {
        insertedCount = await this.insertGuarded(trx, operations, condition);
      } else {
        await trx.insertInto("Operation").values(operations).execute();
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.includes("unique constraint")
      ) {
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

    if (insertedCount !== operations.length) {
      throw new AppendConditionFailedError(condition!);
    }

    return operations.map((op) => ({
      index: op.index,
      timestampUtcMs: op.timestampUtcMs.toISOString(),
      hash: op.hash,
      skip: op.skip,
      error: op.error || undefined,
      deniedReason: op.deniedReason || undefined,
      id: op.opId,
      action: JSON.parse(op.action as string) as Operation["action"],
    }));
  }

  /**
   * Locks the written stream and every read-set stream, in sorted key order
   * so that overlapping concurrent appends serialize rather than deadlock.
   * The locks are still taken one row at a time, so the query preserves that
   * order. It must stay separate from the guarded insert, which would
   * otherwise read a snapshot taken before the locks were held.
   */
  private async acquireStreamLocks(
    trx: Transaction<Database>,
    documentId: string,
    scope: string,
    branch: string,
    condition: AppendCondition,
  ): Promise<void> {
    const keys = new Set<string>([`${documentId}:${scope}:${branch}`]);
    for (const stream of condition.streams) {
      keys.add(`${stream.documentId}:${stream.scope}:${stream.branch}`);
    }

    const sortedKeys = sql.join([...keys].sort());

    await sql`
      with ordered as materialized (
        select key
        from unnest(array[${sortedKeys}]::text[]) with ordinality as t(key, ord)
        order by ord
      )
      select pg_advisory_xact_lock(hashtext(key)) from ordered
    `.execute(trx);
  }

  /**
   * Inserts the staged operations with the condition compiled in as a WHERE
   * NOT EXISTS guard, making the check and the append one statement. Returns
   * the rows inserted; zero means the guard failed and nothing was written.
   */
  private async insertGuarded(
    trx: Transaction<Database>,
    operations: InsertableOperation[],
    condition: AppendCondition,
  ): Promise<number> {
    const branches = operations.map((op) =>
      trx
        .selectNoFrom([
          sql<string>`${op.jobId}::text`.as("jobId"),
          sql<string>`${op.opId}::text`.as("opId"),
          sql<string>`${op.prevOpId}::text`.as("prevOpId"),
          sql<string>`${op.documentId}::text`.as("documentId"),
          sql<string>`${op.documentType}::text`.as("documentType"),
          sql<string>`${op.scope}::text`.as("scope"),
          sql<string>`${op.branch}::text`.as("branch"),
          sql<Date>`${op.timestampUtcMs}::timestamptz`.as("timestampUtcMs"),
          sql<number>`${op.index}::integer`.as("index"),
          sql<unknown>`${op.action}::jsonb`.as("action"),
          sql<number>`${op.skip}::integer`.as("skip"),
          sql<string | null>`${op.error ?? null}::text`.as("error"),
          sql<string | null>`${op.deniedReason ?? null}::text`.as(
            "deniedReason",
          ),
          sql<string>`${op.hash}::text`.as("hash"),
        ])
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("Operation")
                .select("Operation.id")
                .where((web) =>
                  web.or(
                    condition.streams.map((s) =>
                      web.and([
                        web("Operation.documentId", "=", s.documentId),
                        web("Operation.scope", "=", s.scope),
                        web("Operation.branch", "=", s.branch),
                        web("Operation.index", ">", s.revision),
                      ]),
                    ),
                  ),
                ),
            ),
          ),
        ),
    );

    let expression = branches[0];
    for (let i = 1; i < branches.length; i++) {
      expression = expression.unionAll(branches[i]);
    }

    const inserted = await trx
      .insertInto("Operation")
      .columns([
        "jobId",
        "opId",
        "prevOpId",
        "documentId",
        "documentType",
        "scope",
        "branch",
        "timestampUtcMs",
        "index",
        "action",
        "skip",
        "error",
        "deniedReason",
        "hash",
      ])
      .expression(expression)
      .returning("id")
      .execute();

    return inserted.length;
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
      deniedReason: row.deniedReason || undefined,
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
