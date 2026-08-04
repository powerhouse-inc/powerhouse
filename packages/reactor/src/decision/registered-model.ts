import type {
  AuthRequest,
  AuthSubject,
} from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { ReactorFeatureFlags } from "../executor/types.js";
import type { AppendCondition } from "../storage/interfaces.js";
import { authDecisionModel } from "./auth-decision-model.js";
import { buildDecisionModel } from "./build-decision-model.js";
import type { DocumentDecisionModel } from "./document-decision-model.js";
import { documentDecisionModel } from "./document-decision-model.js";
import type { DecisionModel, DecisionTarget, Evaluation } from "./types.js";

/**
 * A model this reactor can register. Every one carries the document projection,
 * because admission reads the version and the deletion timestamp off it; a model
 * with more projections than that is still assignable here.
 */
export type RegisteredDecisionModel = (
  target: DecisionTarget,
) => DecisionModel<DocumentDecisionModel>;

/** What admission needs out of a model built at the stream heads. */
export type AdmissionDecision = {
  evaluation: Evaluation;
  appendCondition: AppendCondition;
  documentVersion: number;
  deletedAtUtcIso: string | null;
};

/**
 * Builds the model at the stream heads and decides one request against it. The
 * append condition it returns is the read-set the store enforces at write time.
 */
export async function decideAtHead(
  model: RegisteredDecisionModel,
  cache: IWriteCache,
  target: DecisionTarget,
  subject: AuthSubject,
  request: AuthRequest,
  signal?: AbortSignal,
): Promise<AdmissionDecision> {
  const built = await buildDecisionModel(cache, model, target, signal);

  return {
    evaluation: model(target).decide(built.model, subject, request, {
      scopeState: undefined,
    }),
    appendCondition: built.appendCondition,
    documentVersion: built.model.document.version,
    deletedAtUtcIso: built.model.document.deletedAtUtcIso ?? null,
  };
}

/**
 * The model this reactor enforces. With `authEnforcement` off the auth scope is
 * absent from every append condition and no load walks it.
 */
export function selectDecisionModel(
  flags: ReactorFeatureFlags,
): RegisteredDecisionModel {
  return flags.authEnforcement ? authDecisionModel : documentDecisionModel;
}
