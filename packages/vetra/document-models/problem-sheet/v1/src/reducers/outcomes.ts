import type { ProblemSheetOutcomesOperations } from "document-models/problem-sheet/v1";
import {
  DuplicateOutcomeIdError,
  OutcomeNotFoundError,
} from "../../gen/outcomes/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const problemSheetOutcomesOperations: ProblemSheetOutcomesOperations = {
  addOutcomeOperation(state, action) {
    if (state.outcomes.some((o) => o.id === action.input.id)) {
      throw new DuplicateOutcomeIdError(
        `Outcome ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.outcomes,
      {
        id: action.input.id,
        direction: action.input.direction,
        object: action.input.object,
        scope: action.input.scope,
        metric: action.input.metric ?? null,
        clarifier: action.input.clarifier ?? null,
        role: action.input.role ?? null,
        relatedStep: action.input.relatedStep ?? null,
        notes: action.input.notes ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateOutcomeOperation(state, action) {
    const outcome = state.outcomes.find((o) => o.id === action.input.id);
    if (!outcome) {
      throw new OutcomeNotFoundError(`Outcome ${action.input.id} not found.`);
    }
    if (action.input.direction) outcome.direction = action.input.direction;
    if (action.input.object) outcome.object = action.input.object;
    if (action.input.scope) outcome.scope = action.input.scope;
    if (action.input.metric) outcome.metric = action.input.metric;
    if (action.input.clarifier) outcome.clarifier = action.input.clarifier;
    if (action.input.role) outcome.role = action.input.role;
    if (action.input.relatedStep)
      outcome.relatedStep = action.input.relatedStep;
    if (action.input.notes) outcome.notes = action.input.notes;
  },
  removeOutcomeOperation(state, action) {
    const index = state.outcomes.findIndex((o) => o.id === action.input.id);
    if (index === -1) {
      throw new OutcomeNotFoundError(`Outcome ${action.input.id} not found.`);
    }
    state.outcomes.splice(index, 1);
  },
  reorderOutcomesOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.outcomes.some((o) => o.id === id)) {
        throw new OutcomeNotFoundError(`Outcome ${id} not found.`);
      }
    }
    reorderById(
      state.outcomes,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
  clearOutcomeMetricOperation(state, action) {
    const outcome = state.outcomes.find((o) => o.id === action.input.id);
    if (!outcome) {
      throw new OutcomeNotFoundError(`Outcome ${action.input.id} not found.`);
    }
    outcome.metric = null;
  },
  clearOutcomeRoleOperation(state, action) {
    const outcome = state.outcomes.find((o) => o.id === action.input.id);
    if (!outcome) {
      throw new OutcomeNotFoundError(`Outcome ${action.input.id} not found.`);
    }
    outcome.role = null;
  },
  clearOutcomeStepOperation(state, action) {
    const outcome = state.outcomes.find((o) => o.id === action.input.id);
    if (!outcome) {
      throw new OutcomeNotFoundError(`Outcome ${action.input.id} not found.`);
    }
    outcome.relatedStep = null;
  },
};
