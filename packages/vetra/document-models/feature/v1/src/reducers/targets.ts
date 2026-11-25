import type { FeatureTargetsOperations } from "document-models/feature/v1";
import {
  DuplicateOutcomeTargetIdError,
  OutcomeTargetNotFoundError,
} from "../../gen/targets/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const featureTargetsOperations: FeatureTargetsOperations = {
  addOutcomeTargetOperation(state, action) {
    if (state.targets.some((t) => t.id === action.input.id)) {
      throw new DuplicateOutcomeTargetIdError(
        `Outcome target ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.targets,
      {
        id: action.input.id,
        outcome: {
          documentId: action.input.outcomeDocumentId,
          objectId: action.input.outcomeObjectId,
          statement: action.input.outcomeStatement ?? null,
          scope: action.input.outcomeScope ?? null,
        },
        expectedImportanceChange: action.input.expectedImportanceChange ?? null,
        expectedSatisfactionChange:
          action.input.expectedSatisfactionChange ?? null,
        notes: action.input.notes ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateOutcomeTargetOperation(state, action) {
    const target = state.targets.find((t) => t.id === action.input.id);
    if (!target) {
      throw new OutcomeTargetNotFoundError(
        `Outcome target ${action.input.id} not found.`,
      );
    }
    if (
      action.input.expectedImportanceChange !== undefined &&
      action.input.expectedImportanceChange !== null
    ) {
      target.expectedImportanceChange = action.input.expectedImportanceChange;
    }
    if (
      action.input.expectedSatisfactionChange !== undefined &&
      action.input.expectedSatisfactionChange !== null
    ) {
      target.expectedSatisfactionChange =
        action.input.expectedSatisfactionChange;
    }
    if (action.input.notes) target.notes = action.input.notes;
  },
  updateOutcomeTargetSnippetOperation(state, action) {
    const target = state.targets.find((t) => t.id === action.input.id);
    if (!target) {
      throw new OutcomeTargetNotFoundError(
        `Outcome target ${action.input.id} not found.`,
      );
    }
    if (action.input.statement)
      target.outcome.statement = action.input.statement;
    if (action.input.scope) target.outcome.scope = action.input.scope;
  },
  removeOutcomeTargetOperation(state, action) {
    const index = state.targets.findIndex((t) => t.id === action.input.id);
    if (index === -1) {
      throw new OutcomeTargetNotFoundError(
        `Outcome target ${action.input.id} not found.`,
      );
    }
    state.targets.splice(index, 1);
  },
  reorderOutcomeTargetsOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.targets.some((t) => t.id === id)) {
        throw new OutcomeTargetNotFoundError(`Outcome target ${id} not found.`);
      }
    }
    reorderById(
      state.targets,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
