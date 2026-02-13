import type { OperationWithContext } from "shared/document-model";
import type { ChannelHealth, RemoteFilter } from "./types.js";

export type OperationBatch = {
  documentId: string;
  branch: string;
  scope: string;
  operations: OperationWithContext[];
};

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
    operations?: Array<{ operation: { timestampUtcMs: string } }> | null;
  },
>(envelopes: T[]): T[] {
  return envelopes.slice().sort((a, b) => {
    const aTimestamp = a.operations?.[0]?.operation.timestampUtcMs;
    const bTimestamp = b.operations?.[0]?.operation.timestampUtcMs;

    if (!aTimestamp && !bTimestamp) return 0;
    if (!aTimestamp) return 1;
    if (!bTimestamp) return -1;

    return Number(aTimestamp) - Number(bTimestamp);
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
