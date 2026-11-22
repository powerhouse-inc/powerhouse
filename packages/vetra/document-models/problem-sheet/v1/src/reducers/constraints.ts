import type { ProblemSheetConstraintsOperations } from "document-models/problem-sheet/v1";
import {
  ConstraintNotFoundError,
  DuplicateConstraintIdError,
} from "../../gen/constraints/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const problemSheetConstraintsOperations: ProblemSheetConstraintsOperations =
  {
    addConstraintOperation(state, action) {
      if (state.constraints.some((c) => c.id === action.input.id)) {
        throw new DuplicateConstraintIdError(
          `Constraint ${action.input.id} already exists.`,
        );
      }
      insertItem(
        state.constraints,
        {
          id: action.input.id,
          description: action.input.description,
          severity: action.input.severity,
          notes: action.input.notes ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateConstraintOperation(state, action) {
      const constraint = state.constraints.find(
        (c) => c.id === action.input.id,
      );
      if (!constraint) {
        throw new ConstraintNotFoundError(
          `Constraint ${action.input.id} not found.`,
        );
      }
      if (action.input.description) {
        constraint.description = action.input.description;
      }
      if (action.input.severity) constraint.severity = action.input.severity;
      if (action.input.notes) constraint.notes = action.input.notes;
    },
    removeConstraintOperation(state, action) {
      const index = state.constraints.findIndex(
        (c) => c.id === action.input.id,
      );
      if (index === -1) {
        throw new ConstraintNotFoundError(
          `Constraint ${action.input.id} not found.`,
        );
      }
      state.constraints.splice(index, 1);
    },
    reorderConstraintsOperation(state, action) {
      for (const id of action.input.ids) {
        if (!state.constraints.some((c) => c.id === id)) {
          throw new ConstraintNotFoundError(`Constraint ${id} not found.`);
        }
      }
      reorderById(
        state.constraints,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
  };
