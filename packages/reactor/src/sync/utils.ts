import type { Operation } from "document-model";
import {
  driveCollectionId,
  type OperationIndexEntry,
} from "../cache/operation-index-types.js";
import type { JobWriteReadyEvent } from "../events/types.js";
import type { OperationWithContext } from "../storage/interfaces.js";
import type { PreparedBatch } from "./batch-aggregator.js";
import type { IMailbox } from "./mailbox.js";
import type { SyncOperation } from "./sync-operation.js";
import type { ChannelHealth, RemoteFilter } from "./types.js";

export type OperationBatch = {
  documentId: string;
  branch: string;
  scope: string;
  operations: OperationWithContext[];
};

/**
 * Trims a mailbox using the jobIds from a batch.
 */
export function trimMailboxFromBatch(
  mailbox: IMailbox,
  batch: PreparedBatch,
): void {
  const toRemove: SyncOperation[] = [];

  // we want to guarantee:
  //
  // 1. sync ops are still in the inbox when marked as executed
  // 2. we remove syncops as a batch after they have been executed
  for (const syncOp of batch.entries) {
    for (const item of mailbox.items) {
      if (syncOp.event.jobId === item.jobId) {
        toRemove.push(item);
        break;
      }
    }
  }

  if (toRemove.length > 0) {
    for (const syncOp of toRemove) {
      syncOp.executed();
    }

    mailbox.remove(...toRemove);
  }
}

/**
 * Trims a mailbox using the ack ordinal.
 */
export function trimMailboxFromAckOrdinal(
  mailbox: IMailbox,
  ackOrdinal: number,
) {
  const toRemove: SyncOperation[] = [];

  // we want to guarantee:
  //
  // 1. sync ops are still in the mailbox when marked as applied
  // 2. we remove syncops as a single batch
  for (const syncOp of mailbox.items) {
    let maxOrdinal = 0;
    for (const op of syncOp.operations) {
      maxOrdinal = Math.max(maxOrdinal, op.context.ordinal);
    }

    if (maxOrdinal <= ackOrdinal) {
      toRemove.push(syncOp);
    }
  }

  if (toRemove.length > 0) {
    for (const syncOp of toRemove) {
      syncOp.executed();
    }

    mailbox.remove(...toRemove);
  }
}

/**
 * Filters operations based on a remote's filter criteria.
 *
 * @param operations - The operations to filter
 * @param filter - The filter criteria to apply
 * @returns The filtered operations that match the criteria
 */
export function filterOperations(
  operations: OperationWithContext[],
  filter: RemoteFilter,
): OperationWithContext[] {
  return operations.filter((op) => {
    if (filter.branch && op.context.branch !== filter.branch) {
      return false;
    }

    if (
      filter.documentId.length > 0 &&
      !filter.documentId.includes(op.context.documentId)
    ) {
      return false;
    }

    if (filter.scope.length > 0 && !filter.scope.includes(op.context.scope)) {
      return false;
    }

    return true;
  });
}

/**
 * Creates an idle channel health status.
 *
 * @returns A new idle channel health object
 */
export function createIdleHealth(): ChannelHealth {
  return {
    state: "idle",
    failureCount: 0,
  };
}

/**
 * Batches consecutive operations by documentId and scope, preserving ordering.
 *
 * For operations [a1_doc, a1_global, a2_doc, b1_global], this returns:
 * - Batch 1: [a1_doc] for doc-a, document scope
 * - Batch 2: [a1_global] for doc-a, global scope
 * - Batch 3: [a2_doc] for doc-a, document scope
 * - Batch 4: [b1_global] for doc-b, global scope
 *
 * This ensures operations are grouped for efficient processing while maintaining
 * causality across documents and scopes.
 */
/**
 * Sorts envelopes by the timestamp of their first operation.
 * Envelopes without operations are placed at the end.
 */
export function sortEnvelopesByFirstOperationTimestamp<
  T extends {
    operations?:
      | ReadonlyArray<{ operation: { timestampUtcMs: string } }>
      | null
      | undefined;
  },
>(envelopes: T[]): T[] {
  return envelopes.slice().sort((a, b) => {
    const aTimestamp = a.operations?.[0]?.operation.timestampUtcMs;
    const bTimestamp = b.operations?.[0]?.operation.timestampUtcMs;

    if (!aTimestamp && !bTimestamp) return 0;
    if (!aTimestamp) return 1;
    if (!bTimestamp) return -1;

    return new Date(aTimestamp).getTime() - new Date(bTimestamp).getTime();
  });
}

export function batchOperationsByDocument(
  operations: OperationWithContext[],
): OperationBatch[] {
  const batches: OperationBatch[] = [];

  let currentDocId: string | null = null;
  let currentScope: string | null = null;
  let currentBatch: OperationWithContext[] = [];

  const flushBatch = () => {
    if (
      currentBatch.length === 0 ||
      currentDocId === null ||
      currentScope === null
    ) {
      return;
    }

    batches.push({
      documentId: currentDocId,
      branch: currentBatch[0].context.branch,
      scope: currentScope,
      operations: currentBatch,
    });
    currentBatch = [];
  };

  for (const op of operations) {
    const docId = op.context.documentId;
    const scope = op.context.scope;
    if (docId !== currentDocId || scope !== currentScope) {
      flushBatch();
      currentDocId = docId;
      currentScope = scope;
    }
    currentBatch.push(op);
  }

  flushBatch();
  return batches;
}

export function getMaxOrdinal(operations: OperationWithContext[]): number {
  return operations.reduce(
    (maxOrdinal, operation) => Math.max(maxOrdinal, operation.context.ordinal),
    0,
  );
}

export function filterByCollectionMembership(
  operations: OperationWithContext[],
  collectionId: string,
  collectionMemberships?: Record<string, string[]>,
): OperationWithContext[] {
  if (!collectionMemberships) {
    return [];
  }

  return operations.filter((op) => {
    const documentId = op.context.documentId;
    if (!(documentId in collectionMemberships)) {
      return false;
    }
    return collectionMemberships[documentId].includes(collectionId);
  });
}

export function toOperationWithContext(
  entry: OperationIndexEntry,
): OperationWithContext {
  return {
    operation: {
      id: entry.id,
      index: entry.index,
      skip: entry.skip,
      hash: entry.hash,
      timestampUtcMs: entry.timestampUtcMs,
      action: entry.action,
    } as Operation,
    context: {
      documentId: entry.documentId,
      documentType: entry.documentType,
      scope: entry.scope,
      branch: entry.branch,
      ordinal: entry.ordinal ?? 0,
    },
  };
}

export function mergeCollectionMemberships(
  events: JobWriteReadyEvent[],
): Record<string, string[]> {
  const mergedMemberships: Record<string, string[]> = {};

  for (const event of events) {
    if (event.collectionMemberships) {
      for (const [docId, collections] of Object.entries(
        event.collectionMemberships,
      )) {
        if (!(docId in mergedMemberships)) {
          mergedMemberships[docId] = [];
        }
        for (const c of collections) {
          if (!mergedMemberships[docId].includes(c)) {
            mergedMemberships[docId].push(c);
          }
        }
      }
    }

    for (const op of event.operations) {
      const action = op.operation.action as {
        type: string;
        input?: { sourceId?: string; targetId?: string };
      };
      if (action.type !== "ADD_RELATIONSHIP") {
        continue;
      }
      const input = action.input;
      if (!input?.sourceId || !input.targetId) {
        continue;
      }

      const collectionId = driveCollectionId(op.context.branch, input.sourceId);
      if (!(input.targetId in mergedMemberships)) {
        mergedMemberships[input.targetId] = [];
      }
      if (!mergedMemberships[input.targetId].includes(collectionId)) {
        mergedMemberships[input.targetId].push(collectionId);
      }
    }
  }

  return mergedMemberships;
}
