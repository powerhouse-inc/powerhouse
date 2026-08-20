import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  deserializeSignature,
  toTransportAction,
} from "@powerhousedao/shared/document-model";
import { SyncOperation } from "../sync-operation.js";
import { SyncOperationStatus, type SyncEnvelope } from "../types.js";
import { batchOperationsByDocument } from "../utils.js";

let syncOpCounter = 0;

/**
 * Serializes an action for GraphQL transport.
 *
 * Projects onto exactly the fields `ActionInput` declares, which is what keeps a
 * stale runtime-only field - a legacy `attachments` array, say - from riding
 * along into the mutation variables, where the schema would reject the whole
 * request rather than the field.
 */
export function serializeAction(action: Action): unknown {
  return toTransportAction(action);
}

/**
 * Serializes a SyncEnvelope for GraphQL transport.
 *
 * Signatures are serialized as comma-separated strings since GraphQL schema
 * defines them as [String!]!. The resultingState context field is stripped
 * since it is not defined in OperationContextInput.
 */
export function serializeEnvelope(envelope: SyncEnvelope): unknown {
  return {
    type: envelope.type.toUpperCase(),
    channelMeta: envelope.channelMeta,
    operations: envelope.operations?.map((opWithContext) => ({
      operation: {
        index: opWithContext.operation.index,
        timestampUtcMs: opWithContext.operation.timestampUtcMs,
        hash: opWithContext.operation.hash,
        skip: opWithContext.operation.skip,
        error: opWithContext.operation.error,
        // Omitted while undefined, so a peer whose schema predates the field only
        // sees it on an operation that was actually denied.
        ...(opWithContext.operation.deniedReason !== undefined
          ? { deniedReason: opWithContext.operation.deniedReason }
          : {}),
        id: opWithContext.operation.id,
        action: serializeAction(opWithContext.operation.action),
      },
      context: {
        documentId: opWithContext.context.documentId,
        documentType: opWithContext.context.documentType,
        scope: opWithContext.context.scope,
        branch: opWithContext.context.branch,
        ordinal: opWithContext.context.ordinal,
      },
    })),
    cursor: envelope.cursor,
    key: envelope.key,
    dependsOn: envelope.dependsOn,
  };
}

/**
 * The nullable operation fields as GraphQL delivers them: a selected field
 * arrives as null rather than absent, which `Operation` does not admit.
 */
type WireNullableFields = {
  error?: string | null;
  deniedReason?: string | null;
};

/**
 * `isDenied` tests strictly against undefined, so a null left in place would mark
 * every synced operation denied. The key is removed rather than set to undefined,
 * so an operation that arrived without it stays identical to the one sent.
 */
function normalizeAbsentFields(operation: Operation): Operation {
  const wire: WireNullableFields = operation;
  if (wire.error !== null && wire.deniedReason !== null) {
    return operation;
  }

  const normalized = { ...operation };
  if (wire.error === null) {
    delete normalized.error;
  }
  if (wire.deniedReason === null) {
    delete normalized.deniedReason;
  }

  return normalized;
}

/** Restores signature tuples and null-valued optional fields to undefined. */
function deserializeOperation(
  opWithContext: OperationWithContext,
): OperationWithContext {
  const operation = normalizeAbsentFields(opWithContext.operation);
  const signer = operation.action.context?.signer;

  if (!signer?.signatures || signer.signatures.length === 0) {
    return { ...opWithContext, operation };
  }

  const deserializedSignatures = signer.signatures.map(deserializeSignature);

  const deserializedOperation: Operation = {
    ...operation,
    action: {
      ...operation.action,
      context: {
        ...operation.action.context,
        signer: {
          ...signer,
          signatures: deserializedSignatures,
        },
      },
    },
  };

  return {
    ...opWithContext,
    operation: deserializedOperation,
  };
}

/**
 * Converts a SyncEnvelope containing operations into a SyncOperation.
 *
 * Extracts the necessary metadata from the envelope's operations to create
 * a sync operation that can be processed by the receiving channel. Also
 * deserializes any signatures from comma-separated strings back to tuples,
 * as GraphQL transport serializes Signature tuples for compatibility.
 *
 * @param envelope - The sync envelope containing operations
 * @param remoteName - The name of the remote this sync operation is associated with
 * @returns A new SyncOperation containing the envelope's operations with deserialized signatures
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

  const deserializedOperations = envelope.operations.map(deserializeOperation);
  const firstOp = deserializedOperations[0];
  const documentId = firstOp.context.documentId;
  const branch = firstOp.context.branch;
  const scopes = [
    ...new Set(deserializedOperations.map((op) => op.context.scope)),
  ];

  const syncOpId = `syncop-${envelope.channelMeta.id}-${Date.now()}-${syncOpCounter++}`;

  return new SyncOperation(
    syncOpId,
    envelope.key ?? "",
    (envelope.dependsOn ?? []).filter(Boolean),
    remoteName,
    documentId,
    scopes,
    branch,
    deserializedOperations,
  );
}

/**
 * Converts a SyncEnvelope containing operations into multiple SyncOperations.
 *
 * This function batches operations by documentId, preserving cross-document ordering.
 * For operations [a1, a2, a3, b1, b2, a4], it returns:
 * - SyncOperation 1: [a1, a2, a3] for doc-a
 * - SyncOperation 2: [b1, b2] for doc-b
 * - SyncOperation 3: [a4] for doc-a
 *
 * This ensures operations are grouped for efficient processing while maintaining
 * causality across documents.
 */
export function envelopesToSyncOperations(
  envelope: SyncEnvelope,
  remoteName: string,
): SyncOperation[] {
  if (!envelope.operations || envelope.operations.length === 0) {
    return [];
  }

  const deserializedOps = envelope.operations.map(deserializeOperation);
  const batches = batchOperationsByDocument(deserializedOps);

  return batches.map((batch) => {
    const syncOpId = `syncop-${envelope.channelMeta.id}-${Date.now()}-${syncOpCounter++}`;
    return new SyncOperation(
      syncOpId,
      envelope.key ?? "",
      (envelope.dependsOn ?? []).filter(Boolean),
      remoteName,
      batch.documentId,
      [batch.scope],
      batch.branch,
      batch.operations,
    );
  });
}

export const getLatestAppliedOrdinal = (syncOps: SyncOperation[]): number => {
  let maxOrdinal = 0;
  for (const syncOp of syncOps) {
    if (syncOp.status === SyncOperationStatus.Applied) {
      for (const op of syncOp.operations) {
        maxOrdinal = Math.max(maxOrdinal, op.context.ordinal);
      }
    }
  }
  return maxOrdinal;
};
