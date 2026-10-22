import type {
  Action,
  AddRelationshipActionInput,
  DeleteDocumentActionInput,
  RemoveRelationshipActionInput,
  UpdateRelationshipActionInput,
} from "@powerhousedao/shared/document-model";
import {
  actions as documentActions,
  generateActionId,
} from "@powerhousedao/shared/document-model";

export { documentActions };
export {
  createDocumentAction,
  upgradeDocumentAction,
} from "@powerhousedao/shared/document-model";

/**
 * Creates a DELETE_DOCUMENT action for document deletion.
 */
export function deleteDocumentAction(documentId: string): Action {
  const input: DeleteDocumentActionInput = {
    documentId,
  };

  return {
    id: generateActionId(),
    type: "DELETE_DOCUMENT",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

/**
 * Creates an ADD_RELATIONSHIP action that records a directed edge from
 * `sourceId` to `targetId` with an arbitrary `relationshipType` and optional
 * `metadata`. The edge is opaque to the reactor — consumers (e.g. reactor-drive)
 * define their own type strings such as `"drive/child"` and attach
 * domain-specific metadata.
 */
export function addRelationshipAction(
  sourceId: string,
  targetId: string,
  relationshipType: string,
  metadata?: Record<string, unknown>,
): Action {
  const input: AddRelationshipActionInput = {
    sourceId,
    targetId,
    relationshipType,
    ...(metadata !== undefined ? { metadata } : {}),
  };

  return {
    id: generateActionId(),
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
    id: generateActionId(),
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
    id: generateActionId(),
    type: "REMOVE_RELATIONSHIP",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}
