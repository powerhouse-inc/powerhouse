// Normalizes FlowVersions to the fields the document controls so the
// re-derive sync only resets the builder store on real divergence.
import {
  FlowActionType,
  FlowTriggerType,
  type FlowAction,
  type FlowTrigger,
  type FlowVersion,
} from "../vendor/shared/index.js";

interface NormalizedStep {
  name: string;
  displayName: string;
  type: string;
  piece?: { pieceName: string; version: string; action?: string };
  input?: unknown;
  condition?: string;
  next?: NormalizedStep;
  children?: (NormalizedStep | null)[];
}

function normalizeAction(
  action: FlowAction | undefined,
): NormalizedStep | undefined {
  if (!action) return undefined;
  const base: NormalizedStep = {
    name: action.name,
    displayName: action.displayName,
    type: action.type,
    next: normalizeAction(action.nextAction),
  };
  switch (action.type) {
    case FlowActionType.PIECE:
      base.piece = {
        pieceName: action.settings.pieceName,
        version: action.settings.pieceVersion,
        action: action.settings.actionName,
      };
      base.input = action.settings.input;
      break;
    case FlowActionType.ROUTER: {
      const conditioned = action.settings.branches.find(
        (branch) => "conditions" in branch,
      );
      base.condition =
        conditioned && "conditions" in conditioned
          ? (conditioned.conditions[0]?.[0]?.firstValue ?? "")
          : "";
      base.children = action.children.map((child) =>
        child ? (normalizeAction(child) ?? null) : null,
      );
      break;
    }
    case FlowActionType.CODE:
      base.input = action.settings.input;
      break;
    default:
      break;
  }
  return base;
}

function normalizeTrigger(trigger: FlowTrigger): NormalizedStep {
  if (trigger.type === FlowTriggerType.EMPTY) {
    return { name: trigger.name, displayName: "", type: trigger.type };
  }
  return {
    name: trigger.name,
    displayName: trigger.displayName,
    type: trigger.type,
    piece: {
      pieceName: trigger.settings.pieceName,
      version: trigger.settings.pieceVersion,
      action: trigger.settings.triggerName,
    },
    input: trigger.settings.input as unknown,
    next: normalizeAction(trigger.nextAction as FlowAction | undefined),
  };
}

export function flowVersionsEquivalent(
  a: FlowVersion,
  b: FlowVersion,
): boolean {
  const left = { name: a.displayName, trigger: normalizeTrigger(a.trigger) };
  const right = { name: b.displayName, trigger: normalizeTrigger(b.trigger) };
  return JSON.stringify(left) === JSON.stringify(right);
}
