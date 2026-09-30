// A step's config with its expressions resolved, as the step receives it.
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";
import { EXISTENCE_OPERATORS } from "../core/branch-operators.js";
import {
  resolveExpressions,
  UnresolvedReferenceError,
  type ExpressionScope,
} from "./expressions.js";
import type { WorkflowStepDef } from "./types.js";

type StepInputSource = Pick<
  WorkflowStepDef,
  "pieceName" | "actionName" | "config"
>;

// An existence test asks whether its operand names anything, so a reference
// that resolves to nothing is its answer rather than an error.
export function resolveStepInput(
  step: StepInputSource,
  scope: ExpressionScope,
): unknown {
  const { config } = step;
  if (
    step.pieceName !== CORE_PIECE_NAME ||
    step.actionName !== "branch" ||
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !Object.hasOwn(config, "left")
  ) {
    return resolveExpressions(config, scope);
  }
  const record = config as Record<string, unknown>;
  const operator = resolveExpressions(record.operator, scope);
  if (typeof operator !== "string" || !EXISTENCE_OPERATORS.has(operator)) {
    return resolveExpressions(config, scope);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      key === "left"
        ? resolveOrMissing(value, scope)
        : resolveExpressions(value, scope),
    ]),
  );
}

function resolveOrMissing(value: unknown, scope: ExpressionScope): unknown {
  try {
    return resolveExpressions(value, scope);
  } catch (error) {
    if (error instanceof UnresolvedReferenceError) return undefined;
    throw error;
  }
}
