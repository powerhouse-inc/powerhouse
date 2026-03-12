import type { Operation, OperationWithContext } from "document-model";
import type {
  AtomicTxn,
  DocumentRevisions,
  IOperationStore,
  OperationFilter,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import {
  DuplicateOperationError,
  RevisionMismatchError,
} from "@powerhousedao/reactor";
import type Hyperbee from "hyperbee";
import { HypercoreAtomicTransaction } from "./hypercore-atomic-transaction.js";
import {
  ORDINAL_COUNTER_KEY,
  RANGE_UPPER_BOUND,
  duplicateKey,
  headKey,
  headPrefix,
  operationKey,
  operationPrefix,
  ordinalKey,
  ordinalPrefix,
  pad,
} from "./key-encoding.js";
import type { HeadEntryValue, OrdinalEntry } from "./key-encoding.js";
import type { StoredOperation } from "./types.js";

export class HypercoreOperationStore implements IOperationStore {
  private applyLock: Promise<void> = Promise.resolve();

  constructor(private bee: Hyperbee) {}

  async apply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const prevLock = this.applyLock;
    let releaseLock: () => void;
    this.applyLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;

    try {
      await this.executeApply(
        documentId,
        documentType,
        scope,
        branch,
        revision,
        fn,
        signal,
      );
    } finally {
      releaseLock!();
    }
  }

  private async executeApply(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    revision: number,
    fn: (txn: AtomicTxn) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const hKey = headKey(documentId, scope, branch);
    const headEntry = await this.bee.get(hKey);
    const currentRevision = headEntry
      ? (headEntry.value as HeadEntryValue).index
      : -1;

    if (currentRevision !== revision - 1) {
      throw new RevisionMismatchError(currentRevision + 1, revision);
    }

    const atomicTxn = new HypercoreAtomicTransaction(
      documentId,
      documentType,
      scope,
      branch,
    );
    await fn(atomicTxn);

    const operations = atomicTxn.getOperations();
    if (operations.length === 0) {
      return;
    }

    for (const op of operations) {
      const dupKey = duplicateKey(op.id, op.index, op.skip);
      const existing = await this.bee.get(dupKey);
      if (existing) {
        throw new DuplicateOperationError(
          `${op.id} at index ${op.index} with skip ${op.skip}`,
        );
      }
    }

    const ordinalEntry = await this.bee.get(ORDINAL_COUNTER_KEY);
    let nextOrdinal: number = ordinalEntry ? (ordinalEntry.value as number) : 0;

    const batch = this.bee.batch();

    for (const op of operations) {
      const opKey = operationKey(documentId, scope, branch, op.index);
      const serialized = this.serializeOperation(op);
      await batch.put(opKey, serialized);

      const ordEntry: OrdinalEntry = {
        documentId,
        documentType,
        scope,
        branch,
        index: op.index,
        operation: serialized,
      };
      await batch.put(ordinalKey(nextOrdinal), ordEntry);

      await batch.put(duplicateKey(op.id, op.index, op.skip), "");

      nextOrdinal++;
    }

    const lastOp = operations[operations.length - 1];
    const headValue: HeadEntryValue = {
      index: lastOp.index,
      latestTimestampUtcMs: lastOp.timestampUtcMs,
    };
    await batch.put(hKey, headValue);
    await batch.put(ORDINAL_COUNTER_KEY, nextOrdinal);

    await batch.flush();
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

    const prefix = operationPrefix(documentId, scope, branch);
    const startIndex = revision + 1;
    const cursorIndex =
      paging?.cursor && parseInt(paging.cursor, 10) > 0
        ? parseInt(paging.cursor, 10) + 1
        : startIndex;
    const effectiveStart = Math.max(startIndex, cursorIndex);

    const gt = prefix + pad(effectiveStart - 1);
    const lt = prefix + RANGE_UPPER_BOUND;
    const limit = paging?.limit ? paging.limit + 1 : undefined;

    const items: Operation[] = [];
    const stream = this.bee.createReadStream({ gt, lt, limit });

    for await (const entry of stream) {
      const stored = entry.value as StoredOperation;

      if (filter) {
        if (
          filter.actionTypes &&
          filter.actionTypes.length > 0 &&
          !filter.actionTypes.includes((stored.action as { type: string }).type)
        ) {
          continue;
        }
        if (
          filter.timestampFrom &&
          stored.timestampUtcMs < filter.timestampFrom
        ) {
          continue;
        }
        if (filter.timestampTo && stored.timestampUtcMs > filter.timestampTo) {
          continue;
        }
        if (
          filter.sinceRevision !== undefined &&
          stored.index < filter.sinceRevision
        ) {
          continue;
        }
      }

      items.push(this.toOperation(stored));
    }

    let hasMore = false;
    let resultItems = items;

    if (paging?.limit && items.length > paging.limit) {
      hasMore = true;
      resultItems = items.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && resultItems.length > 0
        ? resultItems[resultItems.length - 1].index.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const resultLimit = paging?.limit || 100;

    return {
      results: resultItems,
      options: { cursor, limit: resultLimit },
      nextCursor,
      next: hasMore
        ? () =>
            this.getSince(
              documentId,
              scope,
              branch,
              revision,
              filter,
              { cursor: nextCursor!, limit: resultLimit },
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

    const cursorValue =
      paging?.cursor && parseInt(paging.cursor, 10) > 0
        ? parseInt(paging.cursor, 10)
        : id;
    const effectiveId = Math.max(id, cursorValue);

    const gt = ordinalPrefix() + pad(effectiveId);
    const lt = ordinalPrefix() + RANGE_UPPER_BOUND;
    const limit = paging?.limit ? paging.limit + 1 : undefined;

    const items: OperationWithContext[] = [];
    const stream = this.bee.createReadStream({ gt, lt, limit });

    for await (const entry of stream) {
      const ordEntry = entry.value as OrdinalEntry;
      const ordinal = parseInt(entry.key.split("/")[1], 10);

      items.push({
        operation: this.toOperation(ordEntry.operation),
        context: {
          documentId: ordEntry.documentId,
          documentType: ordEntry.documentType,
          scope: ordEntry.scope,
          branch: ordEntry.branch,
          ordinal,
        },
      });
    }

    let hasMore = false;
    let resultItems = items;

    if (paging?.limit && items.length > paging.limit) {
      hasMore = true;
      resultItems = items.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && resultItems.length > 0
        ? resultItems[resultItems.length - 1].context.ordinal.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const resultLimit = paging?.limit || 100;

    return {
      results: resultItems,
      options: { cursor, limit: resultLimit },
      nextCursor,
      next: hasMore
        ? () =>
            this.getSinceId(
              id,
              { cursor: nextCursor!, limit: resultLimit },
              signal,
            )
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

    const prefix = operationPrefix(documentId, scope, branch);
    const cursorIndex =
      paging?.cursor && parseInt(paging.cursor, 10) > 0
        ? parseInt(paging.cursor, 10)
        : -1;

    const gt = cursorIndex >= 0 ? prefix + pad(cursorIndex) : prefix;
    const lt = prefix + RANGE_UPPER_BOUND;

    const stream = this.bee.createReadStream({
      gt: cursorIndex >= 0 ? gt : undefined,
      gte: cursorIndex >= 0 ? undefined : gt,
      lt,
    });

    const items: Operation[] = [];

    for await (const entry of stream) {
      const stored = entry.value as StoredOperation;
      if (stored.timestampUtcMs >= minTimestamp) {
        items.push(this.toOperation(stored));
      }
    }

    let hasMore = false;
    let resultItems = items;

    if (paging?.limit && items.length > paging.limit) {
      hasMore = true;
      resultItems = items.slice(0, paging.limit);
    }

    const nextCursor =
      hasMore && resultItems.length > 0
        ? resultItems[resultItems.length - 1].index.toString()
        : undefined;

    const cursor = paging?.cursor || "0";
    const resultLimit = paging?.limit || 100;

    return {
      results: resultItems,
      options: { cursor, limit: resultLimit },
      nextCursor,
      next: hasMore
        ? () =>
            this.getConflicting(
              documentId,
              scope,
              branch,
              minTimestamp,
              { cursor: nextCursor!, limit: resultLimit },
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

    const prefix = headPrefix(documentId);
    const stream = this.bee.createReadStream({
      gte: prefix,
      lt: prefix + "~",
    });

    const revision: Record<string, number> = {};
    let latestTimestamp = new Date(0).toISOString();

    for await (const entry of stream) {
      const parts = entry.key.split("/");
      const entryScope = parts[3];
      const entryBranch = parts[4];

      if (entryBranch !== branch) {
        continue;
      }

      const headValue = entry.value as HeadEntryValue;
      revision[entryScope] = headValue.index + 1;

      if (headValue.latestTimestampUtcMs > latestTimestamp) {
        latestTimestamp = headValue.latestTimestampUtcMs;
      }
    }

    return { revision, latestTimestamp };
  }

  private serializeOperation(op: StoredOperation): StoredOperation {
    return {
      id: op.id,
      index: op.index,
      skip: op.skip,
      timestampUtcMs: op.timestampUtcMs,
      hash: op.hash,
      error: op.error,
      action: op.action,
      documentId: op.documentId,
      documentType: op.documentType,
      scope: op.scope,
      branch: op.branch,
    };
  }

  private toOperation(stored: StoredOperation): Operation {
    return {
      id: stored.id,
      index: stored.index,
      skip: stored.skip,
      timestampUtcMs: stored.timestampUtcMs,
      hash: stored.hash,
      error: stored.error || undefined,
      action: stored.action,
    };
  }
}
