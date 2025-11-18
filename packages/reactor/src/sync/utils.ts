import type { OperationWithContext } from "../storage/interfaces.js";
import type { ChannelHealth, RemoteFilter } from "./types.js";

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
