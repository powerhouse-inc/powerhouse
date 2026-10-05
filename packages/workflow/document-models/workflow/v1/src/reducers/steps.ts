import type { WorkflowStepsOperations } from "document-models/workflow/v1";
import {
  ConfigStepNotFoundError,
  DuplicateStepIdError,
  DuplicateStepKeyError,
  InvalidStepBlockError,
  InvalidUpdateBlockError,
  RemoveStepNotFoundError,
  SetConfigNotObjectError,
  StepConfigNotObjectError,
  StepKeyConflictError,
  StepNotFoundError,
  UpdateConfigNotObjectError,
} from "../../gen/steps/error.js";
import {
  invalidBlock,
  isConfigObject,
  toPropertySettings,
} from "../helpers.js";

export const workflowStepsOperations: WorkflowStepsOperations = {
  addStepOperation(state, action) {
    if (state.steps.some((step) => step.id === action.input.id)) {
      throw new DuplicateStepIdError("A step with this id already exists");
    }
    if (state.steps.some((step) => step.key === action.input.key)) {
      throw new DuplicateStepKeyError("A step with this key already exists");
    }
    const invalid = invalidBlock("action", {
      pieceName: action.input.pieceName,
      pieceVersion: action.input.pieceVersion,
      name: action.input.actionName,
    });
    if (invalid) throw new InvalidStepBlockError(invalid);
    if (!isConfigObject(action.input.config)) {
      throw new StepConfigNotObjectError("A step config must be an object");
    }
    state.steps.push({
      id: action.input.id,
      key: action.input.key,
      name: action.input.name,
      pieceName: action.input.pieceName,
      pieceVersion: action.input.pieceVersion,
      actionName: action.input.actionName,
      connectionId: action.input.connectionId || null,
      config: action.input.config,
      retry: action.input.retry ?? null,
      timeoutSeconds: action.input.timeoutSeconds ?? null,
      idempotencyKeyExpression: action.input.idempotencyKeyExpression || null,
      position: action.input.position ?? null,
      propertySettings: action.input.propertySettings
        ? toPropertySettings(action.input.propertySettings)
        : null,
      lastTest: null,
      skip: action.input.skip ?? null,
      updatedAt: action.timestampUtcMs,
    });
    state.version += 1;
  },
  updateStepOperation(state, action) {
    const step = state.steps.find((step) => step.id === action.input.id);
    if (!step) {
      throw new StepNotFoundError("Step not found");
    }
    // Null or undefined leaves a field as it is; the result must still be valid.
    const pieceName = action.input.pieceName ?? step.pieceName;
    const pieceVersion = action.input.pieceVersion ?? step.pieceVersion;
    const actionName = action.input.actionName ?? step.actionName;
    const invalid = invalidBlock("action", {
      pieceName,
      pieceVersion,
      name: actionName,
    });
    if (invalid) throw new InvalidUpdateBlockError(invalid);
    const { config } = action.input;
    if (config !== undefined && config !== null && !isConfigObject(config)) {
      throw new UpdateConfigNotObjectError("A step config must be an object");
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
    step.pieceName = pieceName;
    step.pieceVersion = pieceVersion;
    step.actionName = actionName;
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
    if (action.input.skip !== undefined) {
      step.skip = action.input.skip ?? null;
    }
    step.updatedAt = action.timestampUtcMs;
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
    if (!isConfigObject(action.input.config)) {
      throw new SetConfigNotObjectError("A step config must be an object");
    }
    if (JSON.stringify(step.config) !== JSON.stringify(action.input.config)) {
      step.updatedAt = action.timestampUtcMs;
    }
    step.config = action.input.config;
    // Undefined leaves the settings unchanged; null clears them.
    if (action.input.propertySettings !== undefined) {
      step.propertySettings = action.input.propertySettings
        ? toPropertySettings(action.input.propertySettings)
        : null;
    }
    state.version += 1;
  },
};
