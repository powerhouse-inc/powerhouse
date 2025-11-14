import { SyncOperation } from "../sync-operation.js";
import type { SyncEnvelope } from "../types.js";

let syncOpCounter = 0;

/**
 * Converts a SyncEnvelope containing operations into a SyncOperation.
 *
 * Extracts the necessary metadata from the envelope's operations to create
 * a sync operation that can be processed by the receiving channel.
 *
 * @param envelope - The sync envelope containing operations
 * @param remoteName - The name of the remote this sync operation is associated with
 * @returns A new SyncOperation containing the envelope's operations
 * @throws Error if envelope has no operations or operations array is empty
 */
export function envelopeToSyncOperation(
  envelope: SyncEnvelope,
  remoteName: string,
): SyncOperation {
  if (!envelope.operations || envelope.operations.length === 0) {
    throw new Error(
      "Cannot create SyncOperation from envelope without operations",
    );
  }

  const operations = envelope.operations;
  const firstOp = operations[0];
  const documentId = firstOp.context.documentId;
  const branch = firstOp.context.branch;
  const scopes = [...new Set(operations.map((op) => op.context.scope))];

  const syncOpId = `syncop-${envelope.channelMeta.id}-${Date.now()}-${syncOpCounter++}`;

  return new SyncOperation(
    syncOpId,
    remoteName,
    documentId,
    scopes,
    branch,
    operations,
  );
}
