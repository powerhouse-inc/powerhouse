import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  driveCollectionId,
  type OperationIndexEntry,
} from "../cache/operation-index-types.js";
import type { JobWriteReadyEvent } from "../events/types.js";
import type { PreparedBatch } from "./batch-aggregator.js";
import type { IMailbox } from "./mailbox.js";
import { SyncOperation } from "./sync-operation.js";
import {
  SyncOperationStatus,
  type ChannelHealth,
  type RemoteFilter,
} from "./types.js";

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

/**
 * Merges SyncOperations that share the same (documentId, scope, branch) into
 * a single SyncOperation per group. Within each group, operations are sorted
 * by context.ordinal. The merged SyncOperation keeps the first group member's
 * jobId; all other jobIds are remapped so external dependencies still resolve.
 */
export function consolidateSyncOperations(
  syncOps: SyncOperation[],
): SyncOperation[] {
  if (syncOps.length <= 1) {
    return syncOps;
  }

  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    { ops: SyncOperation[]; canonicalJobId: string }
  >();
  const jobIdRemap = new Map<string, string>();
  const insertionOrder: GroupKey[] = [];

  for (const syncOp of syncOps) {
    const key: GroupKey = `${syncOp.documentId}|${syncOp.scopes.slice().sort().join(",")}|${syncOp.branch}`;

    const existing = groups.get(key);
    if (existing) {
      existing.ops.push(syncOp);
      if (syncOp.jobId && syncOp.jobId !== existing.canonicalJobId) {
        jobIdRemap.set(syncOp.jobId, existing.canonicalJobId);
      }
    } else {
      groups.set(key, { ops: [syncOp], canonicalJobId: syncOp.jobId });
      insertionOrder.push(key);
    }
  }

  const result: SyncOperation[] = [];

  for (const key of insertionOrder) {
    const group = groups.get(key)!;
    const allOperations = group.ops
      .flatMap((op) => op.operations)
      .sort((a, b) => a.context.ordinal - b.context.ordinal);

    const allDeps = new Set<string>();
    for (const op of group.ops) {
      for (const dep of op.jobDependencies) {
        allDeps.add(dep);
      }
    }
    allDeps.delete(group.canonicalJobId);
    for (const op of group.ops) {
      allDeps.delete(op.jobId);
    }

    const remappedDeps: string[] = [];
    for (const dep of allDeps) {
      const mapped = jobIdRemap.get(dep) ?? dep;
      if (!remappedDeps.includes(mapped) && mapped !== group.canonicalJobId) {
        remappedDeps.push(mapped);
      }
    }

    const first = group.ops[0];
    const merged = new SyncOperation(
      first.id,
      first.jobId,
      remappedDeps,
      first.remoteName,
      first.documentId,
      first.scopes,
      first.branch,
      allOperations,
    );

    if (first.status > SyncOperationStatus.TransportPending) {
      if (first.status >= SyncOperationStatus.Error) {
        merged.executed();
      } else if (first.status >= SyncOperationStatus.Applied) {
        merged.transported();
      } else {
        merged.started();
      }
    }

    result.push(merged);
  }

  return result;
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

type ChunkableItem = {
  syncOp: { jobId: string; jobDependencies: string[] };
};

/**
 * Chunks sync operations into batches that respect dependency-connected
 * components. SyncOps linked by jobDependencies are kept in the same chunk.
 * If a connected component exceeds maxSize, it is split by topological order.
 */
export function chunkSyncOperations<T extends ChunkableItem>(
  items: T[],
  maxSize: number,
): T[][] {
  if (items.length === 0) return [];
  if (items.length <= maxSize) return [items];

  // Union-Find
  const parent = items.map((_, i) => i);
  const rank = new Array<number>(items.length).fill(0);

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra]++;
    }
  }

  const jobIdToIndex = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    jobIdToIndex.set(items[i].syncOp.jobId, i);
  }

  for (let i = 0; i < items.length; i++) {
    for (const dep of items[i].syncOp.jobDependencies) {
      const depIdx = jobIdToIndex.get(dep);
      if (depIdx !== undefined) {
        union(i, depIdx);
      }
    }
  }

  // Group into components preserving insertion order
  const componentMap = new Map<number, T[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    let component = componentMap.get(root);
    if (!component) {
      component = [];
      componentMap.set(root, component);
    }
    component.push(items[i]);
  }

  const components = [...componentMap.values()];

  // Greedy bin-packing
  const chunks: T[][] = [];
  let currentChunk: T[] = [];

  for (const component of components) {
    if (component.length > maxSize) {
      // Flush current chunk first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
      // Split oversized component by topological walk
      for (const subChunk of splitComponent(component, maxSize)) {
        chunks.push(subChunk);
      }
      continue;
    }

    if (currentChunk.length + component.length > maxSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [...component];
    } else {
      currentChunk.push(...component);
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Splits an oversized connected component into chunks by topological order.
 * Cross-chunk dependency references are handled by the caller's dep filter.
 */
function splitComponent<T extends ChunkableItem>(
  items: T[],
  maxSize: number,
): T[][] {
  // Build in-degree map for topological sort within the component
  const jobIdToItem = new Map<string, T>();
  const jobIds = new Set<string>();
  for (const item of items) {
    jobIdToItem.set(item.syncOp.jobId, item);
    jobIds.add(item.syncOp.jobId);
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const item of items) {
    const key = item.syncOp.jobId;
    if (!inDegree.has(key)) inDegree.set(key, 0);
    if (!adjacency.has(key)) adjacency.set(key, []);
    for (const dep of item.syncOp.jobDependencies) {
      if (jobIds.has(dep)) {
        inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
        if (!adjacency.has(dep)) adjacency.set(dep, []);
        adjacency.get(dep)!.push(key);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [key, degree] of inDegree) {
    if (degree === 0) queue.push(key);
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(jobIdToItem.get(key)!);
    for (const neighbor of adjacency.get(key) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // Fall back to insertion order for any items not reached (cycle safety)
  if (sorted.length < items.length) {
    const sortedIds = new Set(sorted.map((item) => item.syncOp.jobId));
    for (const item of items) {
      if (!sortedIds.has(item.syncOp.jobId)) {
        sorted.push(item);
      }
    }
  }

  // Slice into chunks
  const chunks: T[][] = [];
  for (let i = 0; i < sorted.length; i += maxSize) {
    chunks.push(sorted.slice(i, i + maxSize));
  }
  return chunks;
}
