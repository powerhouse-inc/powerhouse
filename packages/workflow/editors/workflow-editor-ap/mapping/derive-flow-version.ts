// WorkflowModel -> Activepieces FlowVersion (pure; re-derived on every change).
import type {
  EdgeModel,
  StepModel,
  WorkflowModel,
} from "../../workflow-editor/ui/model.js";
import {
  BranchExecutionType,
  BranchOperator,
  FlowActionType,
  FlowTriggerType,
  FlowVersionState,
  RouterExecutionType,
  type FlowAction,
  type FlowTrigger,
  type FlowVersion,
} from "../vendor/shared/index.js";
import { pieceFromBlockType } from "./block-type.js";

export const AP_TRIGGER_NAME = "trigger";
export const AP_FLOW_ID = "ph-flow";

export interface DerivedFlowVersion {
  version: FlowVersion;
  // Human-readable reasons the AP tree cannot represent this workflow.
  unsupported: string[];
}

function configRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  return {};
}

function conditionFromConfig(config: unknown): string {
  const value = configRecord(config).condition;
  return typeof value === "string" ? value : "";
}

interface GraphIndex {
  stepById: Map<string, StepModel>;
  outgoing: Map<string, Map<string, EdgeModel>>;
  unsupported: string[];
}

// Indexes edges by source+port and records shapes the AP tree cannot hold.
function indexGraph(model: WorkflowModel): GraphIndex {
  const unsupported: string[] = [];
  const stepById = new Map(model.steps.map((step) => [step.id, step]));
  const outgoing = new Map<string, Map<string, EdgeModel>>();
  const incomingCount = new Map<string, number>();

  for (const edge of model.edges) {
    if (!stepById.has(edge.to)) continue;
    if (edge.port === "error") {
      unsupported.push(`"error" edges are not supported (edge ${edge.id})`);
      continue;
    }
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    const ports = outgoing.get(edge.from) ?? new Map<string, EdgeModel>();
    if (ports.has(edge.port)) {
      unsupported.push(
        `step has multiple "${edge.port}" edges (edge ${edge.id})`,
      );
      continue;
    }
    ports.set(edge.port, edge);
    outgoing.set(edge.from, ports);
  }

  for (const [stepId, count] of incomingCount) {
    if (count > 1) {
      const step = stepById.get(stepId);
      unsupported.push(`step "${step?.key ?? stepId}" has multiple parents`);
    }
  }
  return { stepById, outgoing, unsupported };
}

function toAction(
  step: StepModel,
  index: GraphIndex,
  visited: Set<string>,
): FlowAction {
  if (visited.has(step.id)) {
    index.unsupported.push(`cycle through step "${step.key}"`);
    // Break the cycle with a leaf stand-in; callers surface the fallback panel.
    return codeStandIn(step);
  }
  visited.add(step.id);

  const ports = index.outgoing.get(step.id) ?? new Map<string, EdgeModel>();
  const nextEdge = ports.get("next");
  const isBranch = step.blockType === "core#branch";

  if (isBranch) {
    if (nextEdge) {
      index.unsupported.push(`branch "${step.key}" has a "next" edge`);
    }
    const child = (port: string): FlowAction | null => {
      const edge = ports.get(port);
      const target = edge ? index.stepById.get(edge.to) : undefined;
      return target ? toAction(target, index, visited) : null;
    };
    return {
      name: step.key,
      displayName: step.name,
      valid: true,
      skip: false,
      lastUpdatedDate: "",
      type: FlowActionType.ROUTER,
      settings: {
        executionType: RouterExecutionType.EXECUTE_FIRST_MATCH,
        branches: [
          {
            branchType: BranchExecutionType.CONDITION,
            branchName: "True",
            conditions: [
              [
                {
                  operator: BranchOperator.BOOLEAN_IS_TRUE,
                  firstValue: conditionFromConfig(step.config),
                },
              ],
            ],
          },
          { branchType: BranchExecutionType.FALLBACK, branchName: "False" },
        ],
      },
      children: [child("true"), child("false")],
    };
  }

  const nextStep = nextEdge ? index.stepById.get(nextEdge.to) : undefined;
  const nextAction = nextStep ? toAction(nextStep, index, visited) : undefined;

  const piece = pieceFromBlockType(step.blockType);
  if (!piece || piece.kind !== "action") {
    return { ...codeStandIn(step), nextAction };
  }

  return {
    name: step.key,
    displayName: step.name,
    valid: true,
    skip: false,
    lastUpdatedDate: "",
    type: FlowActionType.PIECE,
    settings: {
      pieceName: piece.pieceName,
      pieceVersion: piece.pieceVersion,
      actionName: piece.name,
      input: configRecord(step.config),
      propertySettings: {},
      errorHandlingOptions: {},
    },
    nextAction,
  };
}

// Visual stand-in for block types the AP model cannot express.
function codeStandIn(step: StepModel): FlowAction {
  return {
    name: step.key,
    displayName: step.name,
    valid: true,
    skip: false,
    lastUpdatedDate: "",
    type: FlowActionType.CODE,
    settings: {
      sourceCode: { code: "", packageJson: "{}" },
      input: configRecord(step.config),
      errorHandlingOptions: {},
    },
  };
}

function toTrigger(
  model: WorkflowModel,
  index: GraphIndex,
  visited: Set<string>,
): FlowTrigger {
  const trigger = model.trigger;
  if (!trigger) {
    return {
      name: AP_TRIGGER_NAME,
      displayName: "Select Trigger",
      valid: false,
      lastUpdatedDate: "",
      type: FlowTriggerType.EMPTY,
      settings: {},
    };
  }
  const ports = index.outgoing.get(trigger.id) ?? new Map<string, EdgeModel>();
  for (const port of ports.keys()) {
    if (port !== "next") {
      index.unsupported.push(`trigger has a "${port}" edge`);
    }
  }
  const nextEdge = ports.get("next");
  const nextStep = nextEdge ? index.stepById.get(nextEdge.to) : undefined;
  const piece = pieceFromBlockType(trigger.blockType);
  return {
    name: AP_TRIGGER_NAME,
    displayName: triggerDisplayName(trigger.blockType),
    valid: true,
    lastUpdatedDate: "",
    type: FlowTriggerType.PIECE,
    settings: {
      pieceName: piece?.pieceName ?? trigger.blockType,
      pieceVersion: piece?.pieceVersion ?? "0.0.1",
      triggerName: piece?.name,
      input: configRecord(trigger.config),
      propertySettings: {},
    },
    nextAction: nextStep ? toAction(nextStep, index, visited) : undefined,
  };
}

const TRIGGER_NAMES: Record<string, string> = {
  "core#manual": "Manual",
  "core#document-event": "Document event",
};

function triggerDisplayName(blockType: string): string {
  return TRIGGER_NAMES[blockType] ?? blockType;
}

export function deriveFlowVersion(model: WorkflowModel): DerivedFlowVersion {
  const index = indexGraph(model);
  const visited = new Set<string>();
  const trigger = toTrigger(model, index, visited);

  for (const step of model.steps) {
    if (!visited.has(step.id)) {
      index.unsupported.push(
        `step "${step.key}" is not reachable from the trigger`,
      );
    }
  }

  const version: FlowVersion = {
    id: `ph-version-${model.version}`,
    created: "",
    updated: "",
    flowId: AP_FLOW_ID,
    displayName: model.name || "Untitled workflow",
    trigger,
    updatedBy: null,
    valid: true,
    schemaVersion: null,
    agentIds: [],
    state: FlowVersionState.DRAFT,
    connectionIds: [],
    backupFiles: null,
    notes: [],
  };
  return { version, unsupported: index.unsupported };
}
