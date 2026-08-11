import type {
  AuthGroups,
  AuthRefusal,
  AuthRequest,
  AuthSubject,
  ConditionContext,
  Operation,
  PHAuthState,
  PHDocument,
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
  groupDocumentType,
  groupMembershipActionTypes,
  mentionedGroupIds,
  normalizeDocumentModelVersion,
  referencedGroupIds,
} from "@powerhousedao/shared/document-model";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type {
  DecisionModel,
  DecisionTarget,
  Evaluation,
  Projection,
} from "./types.js";

export type AuthDecisionModel = {
  document: PHDocumentState;
  auth: PHAuthState;
};

/** The auth model with the referenced group documents folded in. */
export type AuthGroupsDecisionModel = AuthDecisionModel & {
  groups: AuthGroups;
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

function decideAuthModel(
  model: AuthDecisionModel,
  subject: AuthSubject,
  request: AuthRequest,
  groups?: AuthGroups,
  conditions?: ConditionContext,
): Evaluation {
  // A read has no position, so deletion does not gate it.
  if (request.verb === "execute" && model.document.isDeleted) {
    return { decision: "deny", reason: DOCUMENT_DELETED_REASON };
  }

  const evaluation = evaluate(model.auth, subject, request, groups, conditions);
  if (evaluation.decision === "allow") {
    return { decision: "allow" };
  }

  return { decision: "deny", reason: refusalReason(evaluation.refusal) };
}

function documentProjection<M>(target: DecisionTarget): Projection<M> {
  return {
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
  };
}

function authProjection<M>(target: DecisionTarget): Projection<M> {
  return {
    decidingActions: [...AUTH_ACTION_TYPES],

    // Every auth handler returns new objects already.
    apply: (document, operation) => applyAuthAction(document, operation.action),

    query: {
      documentId: target.documentId,
      branch: target.branch,
      scope: "auth",
    },
  };
}

/** This decision model uses both the document and the auth streams. */
export function authDecisionModel(
  target: DecisionTarget,
): DecisionModel<AuthDecisionModel> {
  return {
    projections: {
      document: documentProjection(target),
      auth: authProjection(target),
    },

    // The auth scope included: a delete can refuse an auth operation after it.
    evaluatesScope() {
      return true;
    },

    decide(model, subject, request): Evaluation {
      return decideAuthModel(model, subject, request);
    },
  };
}

/**
 * Folds one group-stream operation with the registered group model's reducer.
 * A reactor without the module registered folds nothing, so the member list
 * stays as read and a missing reducer never widens access.
 */
function applyGroupOperation(
  registry: IDocumentModelRegistry,
  document: PHDocument,
  operation: Operation,
): PHDocument {
  let reducer: (document: PHDocument, action: unknown) => PHDocument;
  try {
    const module = registry.getModule(groupDocumentType) as {
      reducer: (document: PHDocument, action: unknown) => PHDocument;
    };
    reducer = module.reducer;
  } catch {
    return document;
  }
  return reducer(document, operation.action);
}

/**
 * Folds one evaluated-scope operation with the reducer registered for the
 * document's own type, at the document's stamped version. A reactor without
 * that module folds nothing, so conditions read the base state and an
 * unresolvable reducer never widens access.
 */
function applyModelOperation(
  registry: IDocumentModelRegistry,
  document: PHDocument,
  operation: Operation,
): PHDocument {
  let reducer: (document: PHDocument, action: unknown) => PHDocument;
  try {
    const version = normalizeDocumentModelVersion(
      (document.state as { document?: { version?: number } }).document?.version,
    );
    const module = registry.getModule(
      document.header.documentType,
      version,
    ) as {
      reducer: (document: PHDocument, action: unknown) => PHDocument;
    };
    reducer = module.reducer;
  } catch {
    return document;
  }
  return reducer(document, operation.action);
}

/**
 * The auth model extended with a derived groups projection: the streams it
 * reads are the group documents the folded grant list names, so adding a
 * grant that names a new group pulls that group's stream into the read-set.
 * Group queries pin the main branch, because a group's member list lives on
 * its main branch no matter which branch the referencing document is on.
 */
function groupsProjection(
  registry: IDocumentModelRegistry,
): Projection<AuthGroupsDecisionModel> {
  return {
    decidingActions: [...groupMembershipActionTypes],

    apply: (document, operation) =>
      applyGroupOperation(registry, document, operation),

    query: (model) =>
      referencedGroupIds(model.auth?.grants ?? []).map((id) => ({
        documentId: id,
        branch: "main",
        scope: "global",
      })),

    // A positional walk reads the union of groups the auth range ever
    // names, because a grant referenced at one position folds membership
    // there even if a later operation removes it.
    queryOverHistory: (reads) => {
      const ids: string[] = [];
      for (const read of reads) {
        if (read.name !== "auth") {
          continue;
        }
        for (const operation of read.operations) {
          for (const id of mentionedGroupIds(operation.action)) {
            if (!ids.includes(id)) {
              ids.push(id);
            }
          }
        }
      }
      return ids.map((id) => ({
        documentId: id,
        branch: "main",
        scope: "global",
      }));
    },
  };
}

export function authGroupsDecisionModel(
  registry: IDocumentModelRegistry,
): (target: DecisionTarget) => DecisionModel<AuthGroupsDecisionModel> {
  return (target) => ({
    projections: {
      document: documentProjection(target),
      auth: authProjection(target),
      groups: groupsProjection(registry),
    },

    evaluatesScope() {
      return true;
    },

    decide(model, subject, request): Evaluation {
      return decideAuthModel(model, subject, request, model.groups);
    },
  });
}

/**
 * The groups model with conditions live: decide hands the executing scope's
 * state and the action input through to the evaluator, so `where` clauses
 * and { match } principals apply. The model folds the evaluated scope during
 * a positional walk, so a condition reads the state as it stood at each
 * operation's position.
 */
export function authConditionsDecisionModel(
  registry: IDocumentModelRegistry,
): (target: DecisionTarget) => DecisionModel<AuthGroupsDecisionModel> {
  return (target) => ({
    projections: {
      document: documentProjection(target),
      auth: authProjection(target),
      groups: groupsProjection(registry),
    },

    foldEvaluatedScope: (document, operation) =>
      applyModelOperation(registry, document, operation),

    evaluatesScope() {
      return true;
    },

    decide(model, subject, request, ctx): Evaluation {
      return decideAuthModel(model, subject, request, model.groups, {
        scopeState: ctx.scopeState,
        actionInput: ctx.actionInput,
      });
    },
  });
}
