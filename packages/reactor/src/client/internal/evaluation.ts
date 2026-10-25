import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { DocumentDecisionModel } from "../../decision/document-decision-model.js";
import type { RegisteredDecisionModel } from "../../decision/registered-model.js";
import type { DecisionModel, Evaluation } from "../../decision/types.js";
import type { ReactorFeatureFlags } from "../../executor/types.js";
import {
  GATED_DOCUMENT_ACTIONS,
  targetDocumentId,
} from "../../executor/util.js";
import type { ActionCandidate } from "../types.js";

/**
 * A decision model built for one target document, with what deciding a candidate
 * against it needs: the definition that decides, the built model it decides
 * over, and the scope states a condition reads.
 */
export type EvaluationTarget = {
  definition: DecisionModel<DocumentDecisionModel>;
  model: DocumentDecisionModel;
  scopeStates: Record<string, unknown>;
};

/**
 * What {@link IReactorClient.evaluateActions} decides against: the decision
 * model this reactor enforces, and the flags that selected it.
 *
 * Both, because neither alone is enough. The flags say which of the model's
 * inputs a decision may read, and the model itself cannot be derived from them
 * here: selecting one needs the document model registry, which a client does not
 * hold. Absent, this client answers no preflight at all -- which is the whole of
 * the non-coexistence guarantee, since a client built without a reactor holding
 * a decision model has nothing to answer from.
 */
export type ActionEvaluationConfig = {
  model: RegisteredDecisionModel;
  flags: ReactorFeatureFlags;
};

/**
 * The document a candidate is decided against. Routed on the action type alone,
 * which is what the executor routes on: every action the reactor reduces onto
 * the document scope carries that scope already, and the gate follows the
 * action's own target rather than the document the request named.
 */
export function evaluationTargetId(
  candidate: ActionCandidate,
  fallback: string,
): string {
  return GATED_DOCUMENT_ACTIONS.has(candidate.type)
    ? targetDocumentId(
        { type: candidate.type, input: candidate.input },
        fallback,
      )
    : fallback;
}

/**
 * One candidate's verdict, decided exactly as admission decides it: the same
 * request, and a condition context populated only while authConditions is on,
 * so a conditional grant applies here precisely when it would apply there.
 * Groups need nothing added, because the selected model carries them.
 */
export function decideCandidate(
  config: ActionEvaluationConfig,
  target: EvaluationTarget,
  subject: AuthSubject,
  candidate: ActionCandidate,
): Evaluation {
  return target.definition.decide(
    target.model,
    subject,
    { verb: "execute", scope: candidate.scope, operation: candidate.type },
    config.flags.authConditions
      ? {
          scopeState: target.scopeStates[candidate.scope],
          actionInput: candidate.input,
        }
      : { scopeState: undefined, actionInput: undefined },
  );
}
