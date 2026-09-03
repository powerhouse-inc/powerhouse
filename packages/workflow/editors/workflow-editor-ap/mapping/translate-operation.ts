// Translates Activepieces FlowOperationRequests into workflow document
// callbacks. The document stays the source of truth.
import type {
  AddStepInputModel,
  WorkflowEditorCallbacks,
  WorkflowModel,
} from "../../workflow-editor/ui/model.js";
import {
  FlowActionType,
  FlowOperationType,
  FlowStatus,
  FlowTriggerType,
  StepLocationRelativeToParent,
  type FlowOperationRequest,
  type UpdateActionRequest,
} from "../vendor/shared/index.js";
import {
  blockTypeFromPiece,
  triggerBlockTypeFromPiece,
} from "./block-type.js";
import { AP_TRIGGER_NAME } from "./derive-flow-version.js";

export type TranslateResult = "applied" | "ignored" | "unsupported";

export interface ApDocumentBridge {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  setName: (name: string) => void;
  // Trigger swap that re-attaches the outgoing edge to the new trigger id.
  replaceTrigger: (input: { blockType: string; config: unknown }) => void;
}

function warn(reason: string): TranslateResult {
  console.warn(`[workflow-editor-ap] ${reason}`);
  return "unsupported";
}

function routerCondition(settings: {
  branches: {
    branchType: string;
    conditions?: { firstValue?: string }[][];
  }[];
}): string {
  const first = settings.branches.find(
    (branch) => branch.conditions !== undefined,
  );
  return first?.conditions?.[0]?.[0]?.firstValue ?? "";
}

// Their action request -> our step input; null when the type has no mapping.
function stepInputFromAction(
  action: UpdateActionRequest,
): AddStepInputModel | null {
  switch (action.type) {
    case FlowActionType.PIECE: {
      const { pieceName, pieceVersion, actionName, input } = action.settings;
      return {
        key: action.name,
        name: action.displayName,
        blockType: blockTypeFromPiece(
          pieceName,
          pieceVersion,
          actionName ?? "",
        ),
        config: input,
      };
    }
    case FlowActionType.ROUTER:
      return {
        key: action.name,
        name: action.displayName,
        blockType: "core#branch",
        config: { condition: routerCondition(action.settings) },
      };
    default:
      return null;
  }
}

function findStepByKey(model: WorkflowModel, key: string) {
  return model.steps.find((step) => step.key === key);
}

function translateAddAction(
  bridge: ApDocumentBridge,
  request: {
    parentStep: string;
    stepLocationRelativeToParent?: StepLocationRelativeToParent;
    branchIndex?: number;
    action: UpdateActionRequest;
  },
): TranslateResult {
  const { model, callbacks } = bridge;
  const input = stepInputFromAction(request.action);
  if (!input) {
    return warn(
      `step type "${request.action.type}" is not supported by the workflow document`,
    );
  }

  let parentId: string;
  let port: string;
  const location =
    request.stepLocationRelativeToParent ?? StepLocationRelativeToParent.AFTER;
  if (request.parentStep === AP_TRIGGER_NAME) {
    if (!model.trigger)
      return warn("cannot add a step before a trigger is set");
    if (location !== StepLocationRelativeToParent.AFTER) {
      return warn(`location "${location}" is not valid after the trigger`);
    }
    parentId = model.trigger.id;
    port = "next";
  } else {
    const parent = findStepByKey(model, request.parentStep);
    if (!parent) return warn(`parent step "${request.parentStep}" not found`);
    parentId = parent.id;
    switch (location) {
      case StepLocationRelativeToParent.AFTER:
        port = "next";
        break;
      case StepLocationRelativeToParent.INSIDE_BRANCH:
        if (parent.blockType !== "core#branch") {
          return warn("INSIDE_BRANCH is only supported on branch steps");
        }
        port = request.branchIndex === 0 ? "true" : "false";
        break;
      default:
        return warn(`step location "${location}" is not supported`);
    }
  }

  const existing = model.edges.find(
    (edge) => edge.from === parentId && edge.port === port,
  );
  if (existing) callbacks.insertStepOnEdge(existing.id, input);
  else callbacks.appendStep(parentId, port, input);
  return "applied";
}

function translateDeleteAction(
  bridge: ApDocumentBridge,
  names: string[],
): TranslateResult {
  const { model, callbacks } = bridge;
  const deletedIds = new Set(
    names
      .map((name) => findStepByKey(model, name)?.id)
      .filter((id): id is string => id !== undefined),
  );
  if (deletedIds.size === 0) return "ignored";

  for (const name of names) {
    const step = findStepByKey(model, name);
    if (!step) continue;
    const incoming = model.edges.find(
      (edge) => edge.to === step.id && !deletedIds.has(edge.from),
    );
    const outgoing = model.edges.find(
      (edge) =>
        edge.from === step.id &&
        edge.port === "next" &&
        !deletedIds.has(edge.to),
    );
    callbacks.removeStep(step.id);
    // Re-link the chain the way the AP delete does.
    if (incoming && outgoing) {
      callbacks.addEdge({
        from: incoming.from,
        to: outgoing.to,
        port: incoming.port,
        condition: incoming.condition ?? undefined,
      });
    }
  }
  return "applied";
}

function translateUpdateAction(
  bridge: ApDocumentBridge,
  request: UpdateActionRequest,
): TranslateResult {
  const { model, callbacks } = bridge;
  const step = findStepByKey(model, request.name);
  if (!step) return warn(`step "${request.name}" not found`);
  const input = stepInputFromAction(request);
  if (!input) {
    return warn(
      `step type "${request.type}" is not supported by the workflow document`,
    );
  }
  callbacks.updateStep({
    id: step.id,
    name: input.name,
    blockType: input.blockType,
    config: input.config,
  });
  return "applied";
}

export function translateOperation(
  bridge: ApDocumentBridge,
  operation: FlowOperationRequest,
): TranslateResult {
  switch (operation.type) {
    case FlowOperationType.CHANGE_NAME:
      bridge.setName(operation.request.displayName);
      return "applied";
    case FlowOperationType.CHANGE_STATUS:
      bridge.callbacks.setStatus(
        operation.request.status === FlowStatus.ENABLED
          ? "ENABLED"
          : "DISABLED",
      );
      return "applied";
    case FlowOperationType.UPDATE_TRIGGER: {
      const request = operation.request;
      if (request.type === FlowTriggerType.EMPTY) {
        if (bridge.model.trigger) bridge.callbacks.clearTrigger();
        return "applied";
      }
      const { pieceName, pieceVersion, triggerName, input } = request.settings;
      bridge.replaceTrigger({
        blockType: triggerBlockTypeFromPiece(
          pieceName,
          pieceVersion,
          triggerName ?? "",
        ),
        config: input,
      });
      return "applied";
    }
    case FlowOperationType.ADD_ACTION:
      return translateAddAction(bridge, operation.request);
    case FlowOperationType.DELETE_ACTION:
      return translateDeleteAction(bridge, operation.request.names);
    case FlowOperationType.UPDATE_ACTION:
      return translateUpdateAction(bridge, operation.request);
    // Sample data, notes and skip flags have no document representation.
    case FlowOperationType.UPDATE_SAMPLE_DATA_INFO:
    case FlowOperationType.SAVE_SAMPLE_DATA:
    case FlowOperationType.UPDATE_NOTE:
    case FlowOperationType.ADD_NOTE:
    case FlowOperationType.DELETE_NOTE:
    case FlowOperationType.SET_SKIP_ACTION:
      return "ignored";
    default:
      return warn(`operation "${operation.type}" is not supported`);
  }
}
