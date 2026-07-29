import type { PHDocumentState } from "@powerhousedao/shared/document-model";
import type { DecisionModel, DecisionTarget } from "./types.js";

/** What the document decision model reads: the target's document scope. */
export type DocumentDecisionModel = {
  document: PHDocumentState;
};

/** Why the model refused an operation. */
export const DOCUMENT_DELETED_REASON = "document deleted";

/**
 * The simplest decision model: one projection over the document scope, which
 * rejects on a deleted document.
 */
export function documentDecisionModel(
  target: DecisionTarget,
): DecisionModel<DocumentDecisionModel> {
  return {
    projections: {
      document: {
        query: {
          documentId: target.documentId,
          branch: target.branch,
          scope: "document",
        },
      },
    },

    decide(model) {
      return model.document.isDeleted ? "deny" : "allow";
    },
  };
}
