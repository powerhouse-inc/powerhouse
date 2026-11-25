import type { ProblemSheetContextOperations } from "document-models/problem-sheet/v1";

export const problemSheetContextOperations: ProblemSheetContextOperations = {
  setContextOperation(state, action) {
    state.context = action.input.context;
  },
  clearContextOperation(state) {
    state.context = null;
  },
};
