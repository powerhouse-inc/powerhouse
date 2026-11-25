import type { ProblemSheetJobStepsOperations } from "document-models/problem-sheet/v1";
import {
  DuplicateJobStepIdError,
  JobStepNotFoundError,
} from "../../gen/job-steps/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const problemSheetJobStepsOperations: ProblemSheetJobStepsOperations = {
  addJobStepOperation(state, action) {
    if (state.coreJobSteps.some((s) => s.id === action.input.id)) {
      throw new DuplicateJobStepIdError(
        `Job step ${action.input.id} already exists.`,
      );
    }
    insertItem(
      state.coreJobSteps,
      {
        id: action.input.id,
        name: action.input.name,
        category: action.input.category,
        description: action.input.description ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateJobStepOperation(state, action) {
    const step = state.coreJobSteps.find((s) => s.id === action.input.id);
    if (!step) {
      throw new JobStepNotFoundError(`Job step ${action.input.id} not found.`);
    }
    if (action.input.name) step.name = action.input.name;
    if (action.input.category) step.category = action.input.category;
    if (action.input.description) step.description = action.input.description;
  },
  removeJobStepOperation(state, action) {
    const index = state.coreJobSteps.findIndex((s) => s.id === action.input.id);
    if (index === -1) {
      throw new JobStepNotFoundError(`Job step ${action.input.id} not found.`);
    }
    state.coreJobSteps.splice(index, 1);
  },
  reorderJobStepsOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.coreJobSteps.some((s) => s.id === id)) {
        throw new JobStepNotFoundError(`Job step ${id} not found.`);
      }
    }
    reorderById(
      state.coreJobSteps,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
};
