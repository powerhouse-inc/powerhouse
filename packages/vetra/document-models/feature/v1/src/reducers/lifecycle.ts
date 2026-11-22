import type { FeatureLifecycleOperations } from "document-models/feature/v1";
import type { FeatureStatus } from "../../gen/types.js";
import { InvalidStatusTransitionError } from "../../gen/lifecycle/error.js";

function assertSource(
  current: FeatureStatus,
  allowed: FeatureStatus[],
  transition: string,
): void {
  if (!allowed.includes(current)) {
    throw new InvalidStatusTransitionError(
      `Cannot ${transition} from status ${current}.`,
    );
  }
}

export const featureLifecycleOperations: FeatureLifecycleOperations = {
  startEvaluationOperation(state) {
    assertSource(state.status, ["PROPOSED"], "start evaluation");
    state.status = "EVALUATING";
  },
  commitFeatureOperation(state) {
    assertSource(state.status, ["PROPOSED", "EVALUATING"], "commit");
    state.status = "COMMITTED";
  },
  promoteToSpecOperation(state, action) {
    assertSource(state.status, ["COMMITTED"], "promote to spec");
    state.status = "IN_SPEC";
    state.promotion = {
      promotedAt: action.input.promotedAt,
      promotedBy: action.input.promotedBy ?? null,
      rationale: action.input.rationale ?? null,
    };
  },
  archiveFeatureOperation(state, action) {
    assertSource(
      state.status,
      ["PROPOSED", "EVALUATING", "COMMITTED", "IN_SPEC", "PARKED"],
      "archive",
    );
    state.status = "ARCHIVED";
    if (action.input.reason) state.notes = action.input.reason;
  },
  parkFeatureOperation(state, action) {
    assertSource(
      state.status,
      ["PROPOSED", "EVALUATING", "COMMITTED", "IN_SPEC"],
      "park",
    );
    state.status = "PARKED";
    if (action.input.reason) state.notes = action.input.reason;
  },
  reopenFeatureOperation(state) {
    assertSource(state.status, ["ARCHIVED", "PARKED"], "reopen");
    state.status = "PROPOSED";
  },
  clearPromotionOperation(state) {
    state.promotion = null;
  },
};
