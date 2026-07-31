import type { PHDocumentState } from "@powerhousedao/shared/document-model";
import { applyDeleteDocumentAction } from "@powerhousedao/shared/document-model";
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
        decidingActions: ["DELETE_DOCUMENT"],

        apply: (document, operation) =>
          operation.action.type === "DELETE_DOCUMENT"
            ? // this apply function mutates, so we pass in a copy
              applyDeleteDocumentAction(
                { ...document, state: { ...document.state } },
                operation.action as never,
              )
            : document,

        query: {
          documentId: target.documentId,
          branch: target.branch,
          scope: "document",
        },
      },
    },

    // this model needs to evaluate all scopes
    evaluatesScope() {
      return true;
    },

    decide(model) {
      return model.document.isDeleted ? "deny" : "allow";
    },
  };
}
