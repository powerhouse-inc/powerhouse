// A step's config with its expressions resolved, as the step receives it.
import {
  CORE_PIECE_NAME,
  ROUTER_ACTION,
} from "@powerhousedao/pieces-framework/workflow";
import { EXISTENCE_OPERATORS } from "../core/branch-operators.js";
import {
  assertNoUnavailableValue,
  resolveExpressions,
  UnavailableValueError,
  UnresolvedReferenceError,
  type ExpressionScope,
} from "./expressions.js";
import type { WorkflowStepDef } from "./types.js";

type StepInputSource = Pick<
  WorkflowStepDef,
  "pieceName" | "actionName" | "config"
>;

/**
 * A step's resolved input, and the last gate before it crosses to the piece.
 *
 * The unavailable wrapper carries its reason on a symbol, so anything that
 * serializes it loses the reason — the worker boundary included. Checking the
 * whole resolved input here, at any depth, is what guarantees that no route
 * through resolution can hand a piece the wrapper as data: the path checks
 * inside `lookupPath` catch the ways an expression reaches one, and this
 * catches whatever they do not.
 */
export function resolveStepInput(
  step: StepInputSource,
  scope: ExpressionScope,
): unknown {
  const input = resolveStepInputRaw(step, scope);
  assertNoUnavailableValue(input);
  return input;
}

// A resumed core wait's input, leaving out props the journal truncated or redacted.
export function resolveResumedCoreInput(
  step: StepInputSource,
  scope: ExpressionScope,
): unknown {
  try {
    return resolveStepInput(step, scope);
  } catch (error) {
    if (!(error instanceof UnavailableValueError)) throw error;
  }
  const { config } = step;
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    try {
      const resolved = resolveExpressions(value, scope);
      assertNoUnavailableValue(resolved);
      input[key] = resolved;
    } catch (error) {
      if (!(error instanceof UnavailableValueError)) throw error;
    }
  }
  return input;
}

// An existence test asks whether its operand names anything, so a reference
// that resolves to nothing is its answer rather than an error. The router's
// branches are conditions of the same shape.
function resolveStepInputRaw(
  step: StepInputSource,
  scope: ExpressionScope,
): unknown {
  const { config } = step;
  if (
    step.pieceName !== CORE_PIECE_NAME ||
    config === null ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    return resolveExpressions(config, scope);
  }
  const record = config as Record<string, unknown>;
  if (step.actionName === "branch") return resolveCondition(record, scope);
  if (step.actionName === ROUTER_ACTION && Array.isArray(record.branches)) {
    const branches: unknown[] = record.branches;
    return {
      ...(resolveExpressions(
        Object.fromEntries(
          Object.entries(record).filter(([key]) => key !== "branches"),
        ),
        scope,
      ) as Record<string, unknown>),
      branches: branches.map((branch) =>
        branch !== null && typeof branch === "object" && !Array.isArray(branch)
          ? resolveCondition(branch as Record<string, unknown>, scope)
          : resolveExpressions(branch, scope),
      ),
    };
  }
  return resolveExpressions(config, scope);
}

function resolveCondition(
  record: Record<string, unknown>,
  scope: ExpressionScope,
): unknown {
  if (!Object.hasOwn(record, "left")) return resolveExpressions(record, scope);
  const operator = resolveExpressions(record.operator, scope);
  if (typeof operator !== "string" || !EXISTENCE_OPERATORS.has(operator)) {
    return resolveExpressions(record, scope);
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
