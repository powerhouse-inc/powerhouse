import type {
  AuthRefusal,
  PHAuthState,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import {
  applyAuthAction,
  applyDeleteDocumentAction,
  AUTH_ACTION_TYPES,
  AUTH_DENIED_BY_GRANT_REASON,
  AUTH_NO_GRANT_REASON,
  AUTH_VERSION_UNSUPPORTED_REASON,
  DOCUMENT_DELETED_REASON,
  evaluate,
} from "@powerhousedao/shared/document-model";
import type { DecisionModel, DecisionTarget, Evaluation } from "./types.js";

export type AuthDecisionModel = {
  document: PHDocumentState;
  auth: PHAuthState;
};

function refusalReason(refusal: AuthRefusal): string {
  switch (refusal) {
    case "version-unsupported":
      return AUTH_VERSION_UNSUPPORTED_REASON;
    case "denied-by-grant":
      return AUTH_DENIED_BY_GRANT_REASON;
    case "no-applicable-grant":
      return AUTH_NO_GRANT_REASON;
  }
}

/** This decision model uses both the document and the auth streams. */
export function authDecisionModel(
  target: DecisionTarget,
): DecisionModel<AuthDecisionModel> {
  return {
    projections: {
      // describe the document stream options
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

      // describe the auth stream options
      auth: {
        decidingActions: [...AUTH_ACTION_TYPES],

        // Every auth handler returns new objects already.
        apply: (document, operation) =>
          applyAuthAction(document, operation.action),

        query: {
          documentId: target.documentId,
          branch: target.branch,
          scope: "auth",
        },
      },
    },

    // The auth scope included: a delete can refuse an auth operation after it.
    evaluatesScope() {
      return true;
    },

    decide(model, subject, request): Evaluation {
      // A read has no position, so deletion does not gate it.
      if (request.verb === "execute" && model.document.isDeleted) {
        return { decision: "deny", reason: DOCUMENT_DELETED_REASON };
      }

      const evaluation = evaluate(model.auth, subject, request);
      if (evaluation.decision === "allow") {
        return { decision: "allow" };
      }

      return { decision: "deny", reason: refusalReason(evaluation.refusal) };
    },
  };
}
