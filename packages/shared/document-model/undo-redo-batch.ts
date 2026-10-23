import type { Action } from "./actions.js";
import type { BaseReducerCapabilities } from "./base-reducer-protocol.js";
import type { PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";
import { undoRedoTargetsOf } from "./retraction.js";
import type { PHBaseState } from "./state.js";
import type { StateReducer } from "./types.js";
import type { UndoRedoTargets } from "./undo-redo-plan.js";
import { undoNeedsTargets, undoRedoActions } from "./undo-redo-plan.js";

/** One job's actions, UNDO and REDO among them, built in order. */
export type UndoRedoBatch = {
  /** The job, in the order its actions were added. */
  readonly actions: readonly Action[];
  add(action: Action): void;
  /** Adds the RETRACT of a target resolved as if every earlier action were stored. */
  undoOrRedo(type: "UNDO" | "REDO", scope: string): void;
};

/** Base-reducer 3 only. Create each action as it is added: a v3 job runs in creation order. */
export function undoRedoBatch<TState extends PHBaseState>(
  document: PHDocument<TState>,
  caps: BaseReducerCapabilities,
  reducer: StateReducer<TState>,
): UndoRedoBatch {
  if (!undoNeedsTargets(caps)) {
    throw new Error(
      `Base-reducer ${caps.version} undoes without targets; submit UNDO and REDO`,
    );
  }
  const actions: Action[] = [];
  const streams = new Map<string, Operation[]>();

  const streamOf = (scope: string): Operation[] => {
    let stream = streams.get(scope);
    if (stream === undefined) {
      stream = [...(document.operations[scope] ?? [])];
      streams.set(scope, stream);
    }
    return stream;
  };

  const add = (action: Action): void => {
    actions.push(action);
    const stream = streamOf(action.scope);
    const index = stream.reduce((max, row) => Math.max(max, row.index), -1);
    stream.push({
      id: "",
      index: index + 1,
      skip: 0,
      hash: "",
      timestampUtcMs: action.timestampUtcMs,
      action,
    });
  };

  const targetsOf = (scope: string): UndoRedoTargets =>
    undoRedoTargetsOf(
      {
        ...document,
        operations: { ...document.operations, [scope]: streamOf(scope) },
      },
      caps,
      scope,
      reducer,
    );

  return {
    actions,
    add,
    undoOrRedo(type, scope) {
      for (const action of undoRedoActions(
        caps,
        type,
        scope,
        targetsOf(scope),
      )) {
        add(action);
      }
    },
  };
}
