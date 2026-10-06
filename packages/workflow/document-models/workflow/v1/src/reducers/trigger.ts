import type { WorkflowTriggerOperations } from "document-models/workflow/v1";
import {
  InvalidTriggerBlockError,
  TriggerConfigNotObjectError,
  TriggerNotSetError,
} from "../../gen/trigger/error.js";
import {
  invalidBlock,
  isConfigObject,
  toPropertySettings,
} from "../helpers.js";

export const workflowTriggerOperations: WorkflowTriggerOperations = {
  setTriggerOperation(state, action) {
    const { input } = action;
    const invalid = invalidBlock("trigger", {
      pieceName: input.pieceName,
      pieceVersion: input.pieceVersion,
      name: input.triggerName,
    });
    if (invalid) throw new InvalidTriggerBlockError(invalid);
    if (!isConfigObject(input.config)) {
      throw new TriggerConfigNotObjectError(
        "The trigger config must be an object",
      );
    }
    // Same binding: omitted settings and last test carry over.
    const current = state.trigger;
    const previous =
      current &&
      current.id === input.id &&
      current.pieceName === input.pieceName &&
      current.pieceVersion === input.pieceVersion &&
      current.triggerName === input.triggerName
        ? current
        : null;
    state.trigger = {
      id: input.id,
      pieceName: input.pieceName,
      pieceVersion: input.pieceVersion,
      triggerName: input.triggerName,
      connectionId: input.connectionId || null,
      reactorConnectionId: input.reactorConnectionId || null,
      config: input.config,
      propertySettings:
        input.propertySettings === undefined
          ? (previous?.propertySettings ?? null)
          : input.propertySettings
            ? toPropertySettings(input.propertySettings)
            : null,
      lastTest: previous?.lastTest ?? null,
      updatedAt: action.timestampUtcMs,
    };
    state.version += 1;
  },
  clearTriggerOperation(state, _action) {
    if (!state.trigger) {
      throw new TriggerNotSetError("Workflow has no trigger to clear");
    }
    const triggerId = state.trigger.id;
    state.trigger = null;
    state.edges = state.edges.filter((edge) => edge.from !== triggerId);
    state.version += 1;
  },
};
