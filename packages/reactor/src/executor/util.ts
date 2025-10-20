import type { PHDocument } from "document-model";

/**
 * Calculate the next operation index for a specific scope.
 * Each scope maintains its own independent index sequence.
 *
 * Per-scope indexing means:
 * - Each scope (document, global, local, etc.) has independent indexes
 * - Indexes start at 0 for each scope
 * - Different scopes can have operations with the same index value
 *
 * @param document - The document whose operations to inspect
 * @param scope - The scope to calculate the next index for
 * @returns The next available index in the specified scope
 */
export const getNextIndexForScope = (
  document: PHDocument,
  scope: string,
): number => {
  const scopeOps = document.operations[scope];
  if (scopeOps.length === 0) {
    return 0;
  }

  // Find the highest index in this scope
  let maxIndex = -1;
  for (const op of scopeOps) {
    if (op.index > maxIndex) {
      maxIndex = op.index;
    }
  }

  return maxIndex + 1;
};
