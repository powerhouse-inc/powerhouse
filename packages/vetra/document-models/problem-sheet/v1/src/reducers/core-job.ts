import type { ProblemSheetCoreJobOperations } from "document-models/problem-sheet/v1";
import { CoreJobNotSetError } from "../../gen/core-job/error.js";

export const problemSheetCoreJobOperations: ProblemSheetCoreJobOperations = {
  setCoreJobOperation(state, action) {
    state.coreJob = {
      motivation: action.input.motivation,
      verb: action.input.verb,
      object: action.input.object,
      clarifier: action.input.clarifier ?? null,
    };
  },
  updateCoreJobOperation(state, action) {
    if (!state.coreJob) {
      throw new CoreJobNotSetError("No core job statement to update.");
    }
    if (action.input.motivation)
      state.coreJob.motivation = action.input.motivation;
    if (action.input.verb) state.coreJob.verb = action.input.verb;
    if (action.input.object) state.coreJob.object = action.input.object;
    if (action.input.clarifier)
      state.coreJob.clarifier = action.input.clarifier;
  },
  clearCoreJobOperation(state) {
    state.coreJob = null;
  },
};
