import type { WorkflowVariablesOperations } from "document-models/workflow/v1";
import {
  DuplicateVariableKeyError,
  SecretVariableValueError,
  VariableNotFoundError,
} from "../../gen/variables/error.js";

export const workflowVariablesOperations: WorkflowVariablesOperations = {
  setVariableOperation(state, action) {
    // Upserted by id; the key may change, but no two variables share one.
    const existing = state.variables.find(
      (variable) => variable.id === action.input.id,
    );
    const taken = state.variables.some(
      (variable) =>
        variable.key === action.input.key && variable.id !== action.input.id,
    );
    if (taken) {
      throw new DuplicateVariableKeyError(
        `Another variable already uses the key "${action.input.key}"`,
      );
    }
    const value = action.input.value ?? null;
    const type =
      action.input.type === undefined
        ? (existing?.type ?? null)
        : action.input.type;
    if (type === "SECRET" && value !== null && typeof value !== "string") {
      throw new SecretVariableValueError(
        "A SECRET variable's value must be a secret reference string",
      );
    }
    if (existing) {
      existing.key = action.input.key;
      existing.value = value;
      existing.type = type;
      // Undefined leaves it unchanged; an explicit null or "" clears it.
      if (action.input.description !== undefined) {
        existing.description = action.input.description || null;
      }
    } else {
      state.variables.push({
        id: action.input.id,
        key: action.input.key,
        value,
        description: action.input.description || null,
        type,
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
