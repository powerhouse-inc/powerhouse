import type { Operation } from "document-model";
import { garbageCollect, sortOperations } from "document-model/core";
import { fakeAction } from "../helpers.js";

export type InputOperation = Partial<Omit<Operation, "index" | "skip">> & {
  index: number;
  skip: number;
  type?: string;
  value?: string;
};

export const buildOperation = (
  input: InputOperation,
  shuffled = false,
): Operation => {
  if (shuffled) {
    return {
      action: fakeAction({
        type: input.type ?? "TEST",
        input: {},
        scope: "global",
      }),
      timestampUtcMs: new Date().toISOString(),
      hash: `hash-${input.index}`,
      ...input,
    } as Operation;
  }

  return {
    hash: `hash-${input.index}`,
    timestampUtcMs: new Date().toISOString(),
    action: fakeAction({
      type: input.type ?? "TEST",
      input: {},
      scope: "global",
    }),
    ...input,
  } as Operation;
};

export const buildOperations = (
  inputs: InputOperation[],
  shuffled = false,
): Operation[] => inputs.map((i) => buildOperation(i, shuffled));

/**
 * Simulates applying an undo with the given skip value and returns the resulting state.
 * The state is computed by concatenating the 'value' property of remaining operations.
 */
export function rebuildState(
  inputOperations: InputOperation[],
  undoSkip: number,
): string {
  // If skip is -1, result is empty state
  if (undoSkip === -1) {
    return "";
  }

  // Create a new NOOP operation with the calculated skip
  // If undoSkip is not -1, we must have at least one operation
  const lastOp = inputOperations[inputOperations.length - 1]!;
  const nextIndex = lastOp.index + 1;

  const opsWithUndo: InputOperation[] = [
    ...inputOperations,
    { index: nextIndex, skip: undoSkip, type: "NOOP" },
  ];

  // Build full operations and garbage collect
  const operations = buildOperations(opsWithUndo);
  const effectiveOps = garbageCollect(sortOperations(operations));

  // Build state from values of remaining non-NOOP operations
  return effectiveOps
    .map((op) => {
      // Find the original input operation to get its value
      const inputOp = opsWithUndo.find(
        (input) => input.index === op.index && input.skip === op.skip,
      );
      // Only include value if it's not a NOOP
      if (inputOp?.type === "NOOP") {
        return "";
      }
      return inputOp?.value || "";
    })
    .join("");
}
