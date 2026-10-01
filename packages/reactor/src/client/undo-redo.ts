import type {
  CreateDocumentAction,
  Operation,
  PHDocument,
  StateReducer,
  UpgradeDocumentAction,
} from "@powerhousedao/shared/document-model";
import {
  applyUpgradeDocumentAction,
  deriveScope,
  isDenied,
  redoTarget,
  undoTarget,
} from "@powerhousedao/shared/document-model";
import { createDocumentFromAction } from "../executor/util.js";

/** The action ids a base-reducer 3 UNDO and REDO would retract, if any. */
export type UndoRedoTargets = {
  undo: string | undefined;
  redo: string | undefined;
};

// A read model's initialState is its current state, so rebuild it from the spine.
export function initialDocumentFromSpine(
  spine: readonly Operation[],
): PHDocument {
  const [create, ...rest] = [...spine].sort((a, b) => a.index - b.index) as [
    Operation | undefined,
    ...Operation[],
  ];
  if (create?.action.type !== "CREATE_DOCUMENT") {
    throw new Error(
      `Document scope must start with CREATE_DOCUMENT, found ${create?.action.type ?? "nothing"}`,
    );
  }
  let document = createDocumentFromAction(
    create.action as CreateDocumentAction,
  );
  for (const operation of rest) {
    if (operation.error || isDenied(operation)) continue;
    if (operation.action.type !== "UPGRADE_DOCUMENT") continue;
    const action = operation.action as UpgradeDocumentAction;
    if (action.input.fromVersion < action.input.toVersion) {
      document = applyUpgradeDocumentAction(document, action, undefined);
    }
  }
  return document;
}

/** What UNDO and REDO resolve to over `rows`, the whole scope stream. */
export function undoRedoTargets(
  initial: PHDocument,
  rows: readonly Operation[],
  stateReducer: StateReducer,
  scope: string,
): UndoRedoTargets {
  const { applied } = deriveScope(initial, rows, () => stateReducer, scope);
  return {
    undo: undoTarget(rows, applied),
    redo: redoTarget(rows, applied),
  };
}
