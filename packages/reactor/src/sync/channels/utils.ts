import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Action, Operation, Signature } from "document-model";
import { SyncOperation } from "../sync-operation.js";
import { SyncOperationStatus, type SyncEnvelope } from "../types.js";
import { batchOperationsByDocument } from "../utils.js";

let syncOpCounter = 0;

/**
 * Serializes an action for GraphQL transport, converting signature tuples to strings.
 */
export function serializeAction(action: Action): unknown {
  const signer = action.context?.signer;
  if (!signer?.signatures) {
    return action;
  }

  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        ...signer,
        signatures: signer.signatures.map((sig: Signature | string) =>
          Array.isArray(sig) ? sig.join(", ") : sig,
        ),
      },
    },
  };
}

/**
 * Serializes a SyncEnvelope for GraphQL transport.
 *
 * Signatures are serialized as comma-separated strings since GraphQL schema
 * defines them as [String!]!. Extra context fields (resultingState, ordinal)
 * are stripped since they are not defined in OperationContextInput.
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
        id: opWithContext.operation.id,
        action: serializeAction(opWithContext.operation.action),
      },
      context: {
        documentId: opWithContext.context.documentId,
        documentType: opWithContext.context.documentType,
        scope: opWithContext.context.scope,
        branch: opWithContext.context.branch,
      },
    })),
    cursor: envelope.cursor,
    key: envelope.key,
    dependsOn: envelope.dependsOn,
  };
}

/**
 * Deserializes a signature from a comma-separated string back to a tuple.
 *
 * GraphQL serializes Signature tuples as comma-separated strings for transport.
 * This function converts them back to the expected [string, string, string, string, string] format.
 */
function deserializeSignature(sig: Signature | string): Signature {
  if (Array.isArray(sig)) {
    return sig;
  }
  return sig.split(", ") as Signature;
}

/**
 * Deserializes signatures in an operation's signer context from strings back to tuples.
 *
 * When operations are transported via GraphQL, signatures are serialized as comma-separated
 * strings. This function restores them to the Signature tuple format required for verification.
 */
function deserializeOperationSignatures(
  opWithContext: OperationWithContext,
): OperationWithContext {
  const signer = opWithContext.operation.action.context?.signer;
  if (!signer?.signatures || signer.signatures.length === 0) {
    return opWithContext;
  }

  const deserializedSignatures = signer.signatures.map(deserializeSignature);

  const deserializedOperation: Operation = {
    ...opWithContext.operation,
    action: {
      ...opWithContext.operation.action,
      context: {
        ...opWithContext.operation.action.context,
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

  const deserializedOperations = envelope.operations.map(
    deserializeOperationSignatures,
  );
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

  const deserializedOps = envelope.operations.map(
    deserializeOperationSignatures,
  );
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
