import type {
  Action,
  AddRelationshipActionInput,
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  RemoveRelationshipActionInput,
  UpdateRelationshipActionInput,
  UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import {
  actions as documentActions,
  generateId,
} from "@powerhousedao/shared/document-model";

export { documentActions };

/**
 * Creates a CREATE_DOCUMENT action for document creation.
 */
export function createDocumentAction(input: CreateDocumentActionInput): Action {
  return {
    id: generateId(),
    type: "CREATE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates an UPGRADE_DOCUMENT action to set initial document state.
 */
export function upgradeDocumentAction(
  input: UpgradeDocumentActionInput,
): Action {
  return {
    id: generateId(),
    type: "UPGRADE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates a DELETE_DOCUMENT action for document deletion.
 */
export function deleteDocumentAction(documentId: string): Action {
  const input: DeleteDocumentActionInput = {
    documentId,
  };

  return {
    id: generateId(),
    type: "DELETE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates an ADD_RELATIONSHIP action to establish a parent-child relationship.
 */
export function addRelationshipAction(
  sourceId: string,
  targetId: string,
  relationshipType: string = "child",
  metadata?: Record<string, unknown>,
): Action {
  const input: AddRelationshipActionInput = {
    sourceId,
    targetId,
    relationshipType,
    ...(metadata !== undefined ? { metadata } : {}),
  };

  return {
    id: generateId(),
    type: "ADD_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates an UPDATE_RELATIONSHIP action to replace a relationship's metadata
 * without losing its createdAt ordering.
 */
export function updateRelationshipAction(
  sourceId: string,
  targetId: string,
  relationshipType: string,
  metadata: Record<string, unknown> | null,
): Action {
  const input: UpdateRelationshipActionInput = {
    sourceId,
    targetId,
    relationshipType,
    metadata,
  };

  return {
    id: generateId(),
    type: "UPDATE_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates a REMOVE_RELATIONSHIP action to remove a parent-child relationship.
 */
export function removeRelationshipAction(
  sourceId: string,
  targetId: string,
  relationshipType: string = "child",
): Action {
  const input: RemoveRelationshipActionInput = {
    sourceId,
    targetId,
    relationshipType,
  };

  return {
    id: generateId(),
    type: "REMOVE_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}
