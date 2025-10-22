import type {
  CreateDocumentAction,
  CreateDocumentActionInput,
  DeleteDocumentAction,
  PHDocument,
  UpgradeDocumentAction,
} from "document-model";
import { createPresignedHeader, defaultBaseState } from "document-model/core";

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

  // If signing info is present, populate the header signature fields
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

  // Construct the document with default base state (UPGRADE_DOCUMENT will set the full state)
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
 * Applies an UPGRADE_DOCUMENT action to a document.
 * Merges the initialState from the action with the existing document state,
 * preserving auth and document scopes while adding model-specific scopes.
 *
 * @param document - The document to upgrade
 * @param action - The UPGRADE_DOCUMENT action
 * @returns The upgraded document (mutates in place and returns for convenience)
 */
export function applyUpgradeDocumentAction(
  document: PHDocument,
  action: UpgradeDocumentAction,
): PHDocument {
  const input = action.input as {
    initialState?: PHDocument["state"];
    state?: PHDocument["state"];
  };

  const newState = input.initialState || input.state;
  if (newState) {
    document.state = {
      ...document.state,
      ...newState,
    };
    document.initialState = document.state;
  }

  return document;
}

/**
 * Applies a DELETE_DOCUMENT action to a document.
 * Marks the document as deleted in the document scope state.
 *
 * @param document - The document to mark as deleted
 * @param action - The DELETE_DOCUMENT action
 * @returns The updated document (mutates in place and returns for convenience)
 */
export function applyDeleteDocumentAction(
  document: PHDocument,
  action: DeleteDocumentAction,
): PHDocument {
  const deletedAt = action.timestampUtcMs || new Date().toISOString();

  document.state = {
    ...document.state,
    document: {
      ...document.state.document,
      isDeleted: true,
      deletedAtUtcIso: deletedAt,
    },
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
 * @param document - The document whose operations to inspect
 * @param scope - The scope to calculate the next index for
 * @returns The next available index in the specified scope
 */
export const getNextIndexForScope = (
  document: PHDocument,
  scope: string,
): number => {
  if (!document.operations[scope]) {
    return 0;
  }

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
