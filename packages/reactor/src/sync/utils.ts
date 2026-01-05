import type { OperationWithContext } from "../storage/interfaces.js";
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
 * Batches consecutive operations by documentId, preserving cross-document ordering.
 *
 * For operations [a1, a2, a3, b1, b2, a4], this returns:
 * - Batch 1: [a1, a2, a3] for doc-a
 * - Batch 2: [b1, b2] for doc-b
 * - Batch 3: [a4] for doc-a
 *
 * This ensures operations are grouped for efficient processing while maintaining
 * causality across documents.
 */
export function batchOperationsByDocument(
  operations: OperationWithContext[],
): OperationBatch[] {
  const batches: OperationBatch[] = [];

  let currentDocId: string | null = null;
  let currentBatch: OperationWithContext[] = [];

  const flushBatch = () => {
    if (currentBatch.length === 0 || currentDocId === null) return;

    batches.push({
      documentId: currentDocId,
      branch: currentBatch[0].context.branch,
      scopes: [...new Set(currentBatch.map((op) => op.context.scope))],
      operations: currentBatch,
    });
    currentBatch = [];
  };

  for (const op of operations) {
    const docId = op.context.documentId;
    if (docId !== currentDocId) {
      flushBatch();
      currentDocId = docId;
    }
    currentBatch.push(op);
  }

  flushBatch();
  return batches;
}
