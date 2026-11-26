import type { Action, ISigner } from "@powerhousedao/shared/document-model";
import { deleteNode as deleteNodeAction } from "@powerhousedao/shared/document-drive";
import {
  deleteDocumentAction,
  removeRelationshipAction,
} from "../../actions/index.js";
import type { ExecutionJobPlan } from "../../core/types.js";
import { signActions } from "../../core/utils.js";
import type { DocumentRelationship } from "../../storage/interfaces.js";

/** The plan key of the job that deletes `documentId` in a delete batch. */
export function deletePlanKey(documentId: string): string {
  return `delete:${documentId}`;
}

/** What a part of a signed delete derives its action id from: one per document or edge. */
export function deletePart(documentId: string): string {
  return `delete:${documentId}`;
}

export function removalPart(rel: DocumentRelationship): string {
  return `remove:${rel.sourceId}:${rel.targetId}:${rel.relationshipType}`;
}

export function nodePart(driveId: string): string {
  return `node:${driveId}`;
}

/** `action` under `id`, when one is given. */
function withId(action: Action, id: string | undefined): Action {
  return id === undefined ? action : { ...action, id };
}

/** A DELETE_DOCUMENT job plan for one document on "main", signed by `signer`. */
export async function planDelete(
  signer: ISigner,
  documentId: string,
  signal?: AbortSignal,
  id?: string,
): Promise<ExecutionJobPlan> {
  const signed = await signActions(
    [withId(deleteDocumentAction(documentId), id)],
    signer,
    { documentId, branch: "main" },
    signal,
  );
  return signedDeletePlan(signed[0], documentId);
}

/** The job plan of a DELETE_DOCUMENT of `documentId` that is signed already. */
export function signedDeletePlan(
  signed: Action,
  documentId: string,
): ExecutionJobPlan {
  return {
    key: deletePlanKey(documentId),
    documentId,
    scope: "document",
    branch: "main",
    actions: [signed],
    dependsOn: [],
  };
}

/** A signed REMOVE_RELATIONSHIP job plan for one edge, on its source. */
export async function planRemoval(
  signer: ISigner,
  rel: DocumentRelationship,
  dependsOn: string[],
  index: number,
  signal?: AbortSignal,
  id?: string,
): Promise<ExecutionJobPlan> {
  const signed = await signActions(
    [
      withId(
        removeRelationshipAction(
          rel.sourceId,
          rel.targetId,
          rel.relationshipType,
        ),
        id,
      ),
    ],
    signer,
    { documentId: rel.sourceId, branch: "main" },
    signal,
  );
  return {
    key: `remove:${index}`,
    documentId: rel.sourceId,
    scope: "document",
    branch: "main",
    actions: signed,
    dependsOn,
  };
}

/** A signed DELETE_NODE job plan for a document drive's node of `nodeId`. */
export async function planNodeRemoval(
  signer: ISigner,
  driveId: string,
  nodeId: string,
  signal?: AbortSignal,
  id?: string,
): Promise<ExecutionJobPlan> {
  const signed = await signActions(
    [withId(deleteNodeAction({ id: nodeId }), id)],
    signer,
    { documentId: driveId, branch: "main" },
    signal,
  );
  return {
    key: "node",
    documentId: driveId,
    scope: signed[0].scope,
    branch: "main",
    actions: signed,
    dependsOn: [],
  };
}
