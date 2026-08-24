import type {
  Action,
  CreateDocumentAction,
  CreateDocumentActionInput,
  Operation,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  createPresignedHeader,
  defaultBaseState,
  deriveOperationId,
  DOCUMENT_DELETED_REASON,
} from "@powerhousedao/shared/document-model";
import type { Job } from "../queue/types.js";
import {
  AuthorizationDeniedError,
  DocumentDeletedError,
} from "../shared/errors.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import type { JobResult } from "./types.js";

export { applyDeleteDocumentAction, applyUpgradeDocumentAction };

/** Actions the reactor reduces itself, onto the document scope. */
export const DOCUMENT_SCOPE_ACTIONS: ReadonlySet<string> = new Set([
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
]);

/**
 * `CREATE_DOCUMENT` is exempt by necessity: it runs before the document exists,
 * so building a decision model would throw and defer the job forever.
 */
export const GATED_DOCUMENT_ACTIONS: ReadonlySet<string> = new Set(
  [...DOCUMENT_SCOPE_ACTIONS].filter((type) => type !== "CREATE_DOCUMENT"),
);

/**
 * What naming a document-scope action's target takes: its type, and the input
 * the target is read out of. Narrower than `Action` so that a candidate
 * operation nobody has stamped or signed yet can be routed the same way a
 * submitted one is.
 */
export type TargetedAction = {
  type: string;
  input: unknown;
};

/**
 * The document a document-scope action writes to, which is not always the job's
 * own document: delete and upgrade name it in `input.documentId`, and the
 * relationship actions in `input.sourceId`. `execute` only checks that a batch
 * shares one scope, so a caller can submit an action whose target is a document
 * other than the one the job is keyed by. The policy gate has to follow the
 * action rather than the job, or it decides against a policy the caller may
 * control instead of the one guarding the write.
 */
export function targetDocumentId(
  action: TargetedAction,
  fallback: string,
): string {
  const input = action.input as
    | { documentId?: unknown; sourceId?: unknown }
    | undefined;

  if (
    action.type === "ADD_RELATIONSHIP" ||
    action.type === "REMOVE_RELATIONSHIP" ||
    action.type === "UPDATE_RELATIONSHIP"
  ) {
    return typeof input?.sourceId === "string" && input.sourceId.length > 0
      ? input.sourceId
      : fallback;
  }

  return typeof input?.documentId === "string" && input.documentId.length > 0
    ? input.documentId
    : fallback;
}

/**
 * Creates a PHDocument from a CREATE_DOCUMENT action input.
 * Reconstructs the document header and initializes the base state.
 *
 * @param action - The CREATE_DOCUMENT action containing the document parameters
 * @returns A newly constructed PHDocument with initialized header and base state
 */
export function createDocumentFromAction(
  action: CreateDocumentAction,
): PHDocument {
  const input = action.input as CreateDocumentActionInput;

  // Reconstruct the document from CreateDocumentActionInput
  const header = createPresignedHeader();
  header.id = input.documentId;
  header.documentType = input.model;

  if (input.signing) {
    header.createdAtUtcIso = input.signing.createdAtUtcIso;
    header.lastModifiedAtUtcIso = input.signing.createdAtUtcIso;
    header.sig = {
      publicKey: input.signing.publicKey,
      nonce: input.signing.nonce,
    };
  }

  // Populate optional mutable header fields
  if (input.slug !== undefined) {
    header.slug = input.slug;
  }
  // Default slug to document ID if empty (matching legacy behavior)
  if (!header.slug) {
    header.slug = input.documentId;
  }
  if (input.name !== undefined) {
    header.name = input.name;
  }
  if (input.branch !== undefined) {
    header.branch = input.branch;
  }
  if (input.meta !== undefined) {
    header.meta = input.meta;
  }
  if (input.protocolVersions !== undefined) {
    header.protocolVersions = input.protocolVersions;
  }

  // A placeholder: UPGRADE_DOCUMENT writes the model's real initial values.
  const baseState = defaultBaseState();
  const document: PHDocument = {
    header,
    operations: {},
    state: baseState,
    initialState: baseState,
    clipboard: [],
  };

  return document;
}

/**
 * Calculate the next operation index for a specific scope.
 * Each scope maintains its own independent index sequence.
 *
 * Per-scope indexing means:
 * - Each scope (document, global, local, etc.) has independent indexes
 * - Indexes start at 0 for each scope
 * - Different scopes can have operations with the same index value
 *
 * This function uses header.revision which is populated by the cache/storage layer
 * and contains the next available index for each scope. This design avoids requiring
 * the full operation history to be loaded, which is crucial for snapshot-based caching.
 *
 * @param document - The document whose header.revision to inspect
 * @param scope - The scope to calculate the next index for
 * @returns The next available index in the specified scope
 */
export const getNextIndexForScope = (
  document: PHDocument,
  scope: string,
): number => {
  return document.header.revision[scope] || 0;
};

/**
 * Creates an empty consistency token with no coordinates.
 * Used when a job is registered or fails without writing operations.
 *
 * @returns A consistency token with an empty coordinates array
 */
export function createEmptyConsistencyToken(): ConsistencyToken {
  return {
    version: 1,
    createdAtUtcIso: new Date().toISOString(),
    coordinates: [],
  };
}

/**
 * Creates a consistency token from operations written during job execution.
 * Maps each operation to a consistency coordinate tracking (documentId, scope, branch, operationIndex).
 * If no operations are provided, returns an empty token.
 *
 * @param operationsWithContext - Array of operations with their execution context
 * @returns A consistency token representing all operations written
 */
export function createConsistencyToken(
  operationsWithContext: OperationWithContext[],
): ConsistencyToken {
  if (operationsWithContext.length === 0) {
    return createEmptyConsistencyToken();
  }

  const coordinates: ConsistencyCoordinate[] = [];
  for (let i = 0; i < operationsWithContext.length; i++) {
    const opWithContext = operationsWithContext[i]!;
    coordinates.push({
      documentId: opWithContext.context.documentId,
      scope: opWithContext.context.scope,
      branch: opWithContext.context.branch,
      operationIndex: opWithContext.operation.index,
    });
  }

  return {
    version: 1,
    createdAtUtcIso: new Date().toISOString(),
    coordinates,
  };
}

export function createOperation(
  action: Action,
  index: number,
  skip: number,
  context: { documentId: string; scope: string; branch: string },
): Operation {
  const id = deriveOperationId(
    context.documentId,
    context.scope,
    context.branch,
    action.id,
  );

  return {
    id,
    index: index,
    timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
    hash: "",
    skip: skip,
    action: action,
  };
}

export function updateDocumentRevision(
  document: PHDocument,
  scope: string,
  operationIndex: number,
): void {
  document.header.revision = {
    ...document.header.revision,
    [scope]: operationIndex + 1,
  };
}

export function buildSuccessResult(
  job: Job,
  operation: Operation,
  documentId: string,
  documentType: string,
  resultingState: string,
  startTime: number,
): JobResult {
  return {
    job,
    success: true,
    operations: [operation],
    operationsWithContext: [
      {
        operation,
        context: {
          documentId: documentId,
          scope: job.scope,
          branch: job.branch,
          documentType: documentType,
          resultingState,
          ordinal: 0,
        },
      },
    ],
    duration: Date.now() - startTime,
  };
}

export function buildErrorResult(
  job: Job,
  error: Error,
  startTime: number,
): JobResult {
  return {
    job,
    success: false,
    error: error,
    duration: Date.now() - startTime,
  };
}

/**
 * The error a refusal surfaces as. Both classes are already terminal in the job
 * result handler, so a refusal never burns a retry.
 */
export function refusalError(
  reason: string,
  documentId: string,
  deletedAtUtcIso: string | null,
  action: Action,
): Error {
  if (reason === DOCUMENT_DELETED_REASON) {
    return new DocumentDeletedError(documentId, deletedAtUtcIso);
  }
  return new AuthorizationDeniedError(
    documentId,
    action.scope,
    action.type,
    action.context?.signer?.user.address,
  );
}

/**
 * Whether this operation is part of the document's creation. The create and the
 * upgrade from version zero hold the first two indexes for the life of the
 * document, so a reshuffle has to leave them where they are.
 */
export function isGenesisOperation(operation: Operation): boolean {
  if (operation.action.type === "CREATE_DOCUMENT") {
    return true;
  }
  if (operation.action.type !== "UPGRADE_DOCUMENT") {
    return false;
  }
  return (operation.action.input as { fromVersion?: number }).fromVersion === 0;
}
