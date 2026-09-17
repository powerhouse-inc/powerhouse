import type { WorkflowStepsOperations } from "document-models/workflow/v1";
import {
  ConfigStepNotFoundError,
  DuplicateStepIdError,
  DuplicateStepKeyError,
  RemoveStepNotFoundError,
  StepKeyConflictError,
  StepNotFoundError,
} from "../../gen/steps/error.js";

export const workflowStepsOperations: WorkflowStepsOperations = {
  addStepOperation(state, action) {
    if (state.steps.some((step) => step.id === action.input.id)) {
      throw new DuplicateStepIdError("A step with this id already exists");
    }
    if (state.steps.some((step) => step.key === action.input.key)) {
      throw new DuplicateStepKeyError("A step with this key already exists");
    }
    state.steps.push({
      id: action.input.id,
      key: action.input.key,
      name: action.input.name,
      blockType: action.input.blockType,
      connectionId: action.input.connectionId || null,
      config: action.input.config,
      retry: action.input.retry ?? null,
      timeoutSeconds: action.input.timeoutSeconds ?? null,
      idempotencyKeyExpression: action.input.idempotencyKeyExpression || null,
      position: action.input.position ?? null,
    });
    state.version += 1;
  },
  updateStepOperation(state, action) {
    const step = state.steps.find((step) => step.id === action.input.id);
    if (!step) {
      throw new StepNotFoundError("Step not found");
    }
    if (action.input.key) {
      const conflict = state.steps.some(
        (other) =>
          other.key === action.input.key && other.id !== action.input.id,
      );
      if (conflict) {
        throw new StepKeyConflictError("Another step already uses this key");
      }
      step.key = action.input.key;
    }
    if (action.input.name) step.name = action.input.name;
    if (action.input.blockType) step.blockType = action.input.blockType;
    // null clears the connection; undefined leaves it unchanged.
    if (action.input.connectionId !== undefined)
      step.connectionId = action.input.connectionId || null;
    if (action.input.config !== undefined && action.input.config !== null) {
      step.config = action.input.config;
    }
    // For the optional runtime fields null clears; undefined leaves as is.
    if (action.input.retry !== undefined) {
      step.retry = action.input.retry ?? null;
    }
    if (action.input.timeoutSeconds !== undefined) {
      step.timeoutSeconds = action.input.timeoutSeconds ?? null;
    }
    if (action.input.idempotencyKeyExpression !== undefined) {
      step.idempotencyKeyExpression =
        action.input.idempotencyKeyExpression || null;
    }
    if (action.input.position !== undefined) {
      step.position = action.input.position ?? null;
    }
    state.version += 1;
  },
  removeStepOperation(state, action) {
    const index = state.steps.findIndex((step) => step.id === action.input.id);
    if (index === -1) {
      throw new RemoveStepNotFoundError("Step not found");
    }
    state.steps.splice(index, 1);
    state.edges = state.edges.filter(
      (edge) => edge.from !== action.input.id && edge.to !== action.input.id,
    );
    state.version += 1;
  },
  setStepConfigOperation(state, action) {
    const step = state.steps.find((step) => step.id === action.input.id);
    if (!step) {
      throw new ConfigStepNotFoundError("Step not found");
    }
    step.config = action.input.config;
    state.version += 1;
  },
};
