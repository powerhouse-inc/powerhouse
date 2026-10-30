import type { Action } from "./actions.js";
import type { DocumentAction, OperationIndex } from "./types.js";

// Kept free of value imports so documents.ts and retraction.ts can share these
// without forming an import cycle.

export function isDocumentAction(action: Action): action is DocumentAction {
  return ["SET_NAME", "SET_PREFERRED_EDITOR", "UNDO", "REDO"].includes(
    action.type,
  );
}

export function garbageCollect<TOpIndex extends OperationIndex>(
  sortedOperations: TOpIndex[],
) {
  const result: TOpIndex[] = [];

  let i = sortedOperations.length - 1;

  while (i > -1) {
    result.unshift(sortedOperations[i]);
    const skipUntil =
      (sortedOperations[i]?.index || 0) - (sortedOperations[i]?.skip || 0) - 1;

    let j = i - 1;
    while (j > -1 && (sortedOperations[j]?.index || 0) > skipUntil) {
      j--;
    }

    i = j;
  }

  return result;
}

export function sortOperations<TOpIndex extends OperationIndex>(
  operations: TOpIndex[],
): TOpIndex[] {
  return operations
    .slice()
    .sort((a, b) => a.skip - b.skip)
    .sort((a, b) => a.index - b.index);
}

export function nextSkipNumber(sortedOperations: OperationIndex[]) {
  if (sortedOperations.length < 1) {
    return -1;
  }

  const cleanedOperations = garbageCollect(sortedOperations);

  let nextSkip =
    (cleanedOperations[cleanedOperations.length - 1]?.skip || 0) + 1;

  if (cleanedOperations.length > 1) {
    nextSkip += cleanedOperations[cleanedOperations.length - 2]?.skip || 0;
  }

  return (cleanedOperations[cleanedOperations.length - 1]?.index || -1) <
    nextSkip
    ? -1
    : nextSkip;
}
