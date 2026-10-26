import type { ISigner } from "@powerhousedao/shared/document-model";
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

/** A signed DELETE_DOCUMENT job plan for one document on "main". */
export async function planDelete(
  signer: ISigner,
  documentId: string,
  signal?: AbortSignal,
): Promise<ExecutionJobPlan> {
  const signed = await signActions(
    [deleteDocumentAction(documentId)],
    signer,
    { documentId, branch: "main" },
    signal,
  );
  return {
    key: deletePlanKey(documentId),
    documentId,
    scope: "document",
    branch: "main",
    actions: signed,
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
): Promise<ExecutionJobPlan> {
  const signed = await signActions(
    [
      removeRelationshipAction(
        rel.sourceId,
        rel.targetId,
        rel.relationshipType,
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
