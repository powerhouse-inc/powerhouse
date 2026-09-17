import type { WorkflowVariablesOperations } from "document-models/workflow/v1";
import { VariableNotFoundError } from "../../gen/variables/error.js";

export const workflowVariablesOperations: WorkflowVariablesOperations = {
  setVariableOperation(state, action) {
    const existing = state.variables.find(
      (variable) => variable.key === action.input.key,
    );
    if (existing) {
      existing.value = action.input.value ?? null;
      // Undefined leaves it unchanged; an explicit null or "" clears it.
      if (action.input.description !== undefined) {
        existing.description = action.input.description || null;
      }
    } else {
      state.variables.push({
        id: action.input.id,
        key: action.input.key,
        value: action.input.value ?? null,
        description: action.input.description || null,
      });
    }
    state.version += 1;
  },
  removeVariableOperation(state, action) {
    const index = state.variables.findIndex(
      (variable) => variable.id === action.input.id,
    );
    if (index === -1) {
      throw new VariableNotFoundError("Variable not found");
    }
    state.variables.splice(index, 1);
    state.version += 1;
  },
};
