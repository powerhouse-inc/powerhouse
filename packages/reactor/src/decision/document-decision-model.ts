import type { PHDocumentState } from "@powerhousedao/shared/document-model";
import {
  applyDeleteDocumentAction,
  DOCUMENT_DELETED_REASON,
} from "@powerhousedao/shared/document-model";
import type { DecisionModel, DecisionTarget } from "./types.js";

/** What the document decision model reads: the target's document scope. */
export type DocumentDecisionModel = {
  document: PHDocumentState;
};

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

    decide(model, subject, request) {
      // A read has no position, so deletion does not gate it: the read surface
      // serves the state at the deletion boundary rather than refusing.
      return request.verb === "execute" && model.document.isDeleted
        ? { decision: "deny", reason: DOCUMENT_DELETED_REASON }
        : { decision: "allow" };
    },
  };
}
