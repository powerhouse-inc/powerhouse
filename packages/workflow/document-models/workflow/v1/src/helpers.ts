import { isExactVersion } from "@powerhousedao/pieces-framework/block-type";
import type {
  PropertyMode,
  PropertySetting,
  TriggerBinding,
  WorkflowGlobalState,
  WorkflowStep,
} from "../gen/types.js";

// Why a block reference can't be stored, or undefined when it can: every
// block names its piece and itself, and pins an exact piece version.
export function invalidBlock(
  kind: "action" | "trigger",
  block: {
    pieceName?: string | null;
    pieceVersion?: string | null;
    name?: string | null;
  },
): string | undefined {
  if (!block.pieceName) return `The ${kind} names no piece`;
  if (!block.name) return `The ${kind} names no ${kind} of ${block.pieceName}`;
  if (!block.pieceVersion || !isExactVersion(block.pieceVersion)) {
    return `"${block.pieceVersion ?? ""}" is not an exact semver version of ${block.pieceName}`;
  }
  return undefined;
}

export function findStepOrTrigger(
  state: WorkflowGlobalState,
  id: string,
): WorkflowStep | TriggerBinding | undefined {
  if (state.trigger?.id === id) return state.trigger;
  return state.steps.find((step) => step.id === id);
}

export function toPropertySettings(
  input: readonly { prop: string; mode: PropertyMode; schema?: unknown }[],
): PropertySetting[] {
  return input.map((setting) => ({
    prop: setting.prop,
    mode: setting.mode,
    schema: setting.schema ?? null,
  }));
}

// Plain copy that is safe to take from an immer draft.
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Block config is always a JSON object: a string or array is a writer's bug.
export function isConfigObject(config: unknown): boolean {
  return (
    config !== null && typeof config === "object" && !Array.isArray(config)
  );
}
