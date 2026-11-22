import type {
  Action,
  AddRelationshipActionInput,
  RemoveRelationshipActionInput,
} from "@powerhousedao/shared/document-model";
import { generateActionId } from "@powerhousedao/shared/document-model";

/**
 * The document-scope actions the reactor reduces itself, built here as
 * `packages/reactor/src/actions/index.ts` builds them, so the light client
 * signs and pushes them without importing the reactor as a value.
 *
 * Each names its source by id: the signature covers the log the action is
 * written to, which for a relationship is `sourceId`, and the executor writes
 * both ids as given.
 */

/** An ADD_RELATIONSHIP edge from `sourceId` to `targetId`. */
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

/** A REMOVE_RELATIONSHIP of the edge from `sourceId` to `targetId`. */
export function removeRelationshipAction(
  sourceId: string,
  targetId: string,
  relationshipType: string,
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
