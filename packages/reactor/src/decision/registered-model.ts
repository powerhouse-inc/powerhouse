import type {
  AuthRequest,
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { ReactorFeatureFlags } from "../executor/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { AppendCondition } from "../storage/interfaces.js";
import {
  authConditionsDecisionModel,
  authDecisionModel,
  authGroupsDecisionModel,
} from "./auth-decision-model.js";
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
 * What decideAtHead resolves a condition context from: the action's input,
 * with the executing scope's state read at the head. Supplied only while
 * authConditions is on.
 *
 * `carriedDocument` is that state already in hand, for a write that follows
 * another in the same run. The head read would answer with the state as it
 * stood before the run, which is not what the write is appended after.
 */
export type AdmissionConditions = {
  actionInput?: unknown;
  carriedDocument?: PHDocument;
};

/**
 * Builds the model at the stream heads and decides one request against it. The
 * append condition it returns is the read-set the store enforces at write time.
 *
 * With `conditions` supplied, the executing scope's state is read at the head
 * for `doc.<scope>.*` paths, or taken from the run's carried document when the
 * caller has already reduced earlier writes into it. That read carries no
 * append-condition entry of its own: the written stream's expected-revision
 * check already refuses a write whose scope grew between the read and the
 * append.
 */
export async function decideAtHead(
  model: RegisteredDecisionModel,
  cache: IWriteCache,
  target: DecisionTarget,
  subject: AuthSubject,
  request: AuthRequest,
  signal?: AbortSignal,
  conditions?: AdmissionConditions,
): Promise<AdmissionDecision> {
  const built = await buildDecisionModel(cache, model, target, signal);

  let scopeState: unknown;
  if (conditions !== undefined) {
    const document =
      conditions.carriedDocument ??
      (await cache.getState(
        target.documentId,
        request.scope,
        target.branch,
        undefined,
        signal,
      ));
    scopeState = (document.state as Record<string, unknown>)[request.scope];
  }

  return {
    evaluation: model(target).decide(built.model, subject, request, {
      scopeState,
      actionInput: conditions?.actionInput,
    }),
    appendCondition: built.appendCondition,
    documentVersion: built.model.document.version,
    deletedAtUtcIso: built.model.document.deletedAtUtcIso ?? null,
  };
}

/**
 * The model this reactor enforces. With `authEnforcement` off the auth scope is
 * absent from every append condition and no load walks it; with `authGroups`
 * on, the group documents the grant list names join the read-set and the
 * registry supplies the reducer that folds them.
 */
export function selectDecisionModel(
  flags: ReactorFeatureFlags,
  registry: IDocumentModelRegistry,
): RegisteredDecisionModel {
  if (flags.authConditions) {
    return authConditionsDecisionModel(registry);
  }
  if (flags.authGroups) {
    return authGroupsDecisionModel(registry);
  }
  return flags.authEnforcement ? authDecisionModel : documentDecisionModel;
}
