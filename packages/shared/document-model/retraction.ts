import { castDraft, create, unsafe } from "mutative";
import { baseActionReducer } from "./base-action-reducer.js";
import { isDenied } from "./denied.js";
import {
  garbageCollect,
  isDocumentAction,
  sortOperations,
  type PHDocument,
} from "./documents.js";
import type { Operation } from "./operations.js";
import type { PHBaseState } from "./state.js";
import type {
  OperationIndex,
  RetractActionInput,
  StateReducer,
} from "./types.js";

/** Base-reducer 3: the rows left once each reshuffle rewind removes what it covers. */
export function positionalOperations<T extends OperationIndex>(
  stream: readonly T[],
): T[] {
  return garbageCollect(sortOperations([...stream]));
}

export function retractionTarget(operation: Operation): string | undefined {
  return operation.action.type === "RETRACT"
    ? (operation.action.input as RetractActionInput).target
    : undefined;
}

/** Ids a live retraction names; a retraction is live iff no live retraction names it. */
export function retractedActionIds(rows: readonly Operation[]): Set<string> {
  const present = new Set(rows.map((operation) => operation.action.id));
  const targetOf = new Map<string, string>();
  for (const operation of rows) {
    const target = retractionTarget(operation);
    if (
      target !== undefined &&
      target !== operation.action.id &&
      present.has(target)
    ) {
      targetOf.set(operation.action.id, target);
    }
  }
  for (const id of onCycles(targetOf)) {
    targetOf.delete(id);
  }

  const pending = new Map<string, number>();
  for (const target of targetOf.values()) {
    pending.set(target, (pending.get(target) ?? 0) + 1);
  }
  const retracted = new Set<string>();
  const ready = [...present].filter((id) => !pending.has(id));
  while (ready.length > 0) {
    const id = ready.pop()!;
    const target = targetOf.get(id);
    if (target === undefined) continue;
    if (!retracted.has(id)) retracted.add(target);
    const left = pending.get(target)! - 1;
    pending.set(target, left);
    if (left === 0) ready.push(target);
  }
  return retracted;
}

/** The ids on a cycle of `targetOf`, where each id has at most one target. */
function onCycles(targetOf: ReadonlyMap<string, string>): Set<string> {
  const onCycle = new Set<string>();
  const settled = new Set<string>();
  for (const start of targetOf.keys()) {
    if (settled.has(start)) continue;
    const path: string[] = [];
    const onPath = new Set<string>();
    let id: string | undefined = start;
    while (id !== undefined && !settled.has(id) && !onPath.has(id)) {
      path.push(id);
      onPath.add(id);
      id = targetOf.get(id);
    }
    if (id !== undefined && onPath.has(id)) {
      for (let i = path.indexOf(id); i < path.length; i++) {
        onCycle.add(path[i]);
      }
    }
    for (const visited of path) {
      settled.add(visited);
    }
  }
  return onCycle;
}

/** The rows whose actions apply to state, in stream order. */
export function appliedOperations(stream: readonly Operation[]): Operation[] {
  const rows = positionalOperations(stream);
  const retracted = retractedActionIds(rows);
  return rows.filter(
    (operation) =>
      !retracted.has(operation.action.id) &&
      operation.action.type !== "RETRACT" &&
      !isDenied(operation),
  );
}

/** Resolves the state reducer for a row, by the row's module version. */
export type ReducerFor = (operation: Operation) => StateReducer;

/** Applies one row's action to the scope state; throws when the action throws. */
export function reduceOne<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  operation: Operation,
  reducerFor: ReducerFor,
): PHDocument<TState> {
  const action = operation.action;
  if (action.scope === "auth" || action.scope === "document") {
    throw new Error(`Base-reducer 3 does not derive the ${action.scope} scope`);
  }
  if (action.type === "NOOP" || action.type === "RETRACT") {
    return document;
  }
  if (isDocumentAction(action)) {
    return baseActionReducer(document, action);
  }
  const reducer = reducerFor(operation) as unknown as StateReducer<TState>;
  return create(document, (draft) => {
    const next = reducer(draft.state, action);
    if (next) {
      unsafe(() => {
        draft.state = castDraft(next);
      });
    }
  });
}

/** `applied` holds the ids whose action did not throw; a row that throws applies nothing. */
export function deriveScope<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  stream: readonly Operation[],
  reducerFor: ReducerFor,
): { document: PHDocument<TState>; applied: ReadonlySet<string> } {
  const applied = new Set<string>();
  const scope = stream.at(0)?.action.scope;
  if (scope === undefined) {
    return { document, applied };
  }

  const initial = (document.initialState as Record<string, unknown>)[scope];
  let next: PHDocument<TState> = {
    ...document,
    state: { ...document.state, [scope]: initial } as TState,
  };
  for (const operation of appliedOperations(stream)) {
    try {
      next = reduceOne(next, operation, reducerFor);
      applied.add(operation.action.id);
    } catch {
      // A row that throws applies nothing.
    }
  }
  return { document: next, applied };
}

function isContent(operation: Operation | undefined): boolean {
  return (
    operation !== undefined &&
    operation.action.type !== "RETRACT" &&
    operation.action.type !== "NOOP" &&
    !isDenied(operation)
  );
}

/** The action UNDO retracts: the last applied content row. */
export function undoTarget(
  stream: readonly Operation[],
  applied: ReadonlySet<string>,
): string | undefined {
  const rows = positionalOperations(stream);
  for (let i = rows.length - 1; i >= 0; i--) {
    const operation = rows[i];
    if (applied.has(operation.action.id) && isContent(operation)) {
      return operation.action.id;
    }
  }
  return undefined;
}

/** The last live retraction of content, unless applied content follows it. */
export function redoTarget(
  stream: readonly Operation[],
  applied: ReadonlySet<string>,
): string | undefined {
  const rows = positionalOperations(stream);
  const retracted = retractedActionIds(rows);
  const byId = new Map(
    rows.map((operation) => [operation.action.id, operation]),
  );
  for (let i = rows.length - 1; i >= 0; i--) {
    const operation = rows[i];
    if (retracted.has(operation.action.id)) continue;
    const target = retractionTarget(operation);
    if (target === undefined) {
      if (applied.has(operation.action.id) && isContent(operation)) {
        return undefined;
      }
      continue;
    }
    if (isContent(byId.get(target))) return operation.action.id;
  }
  return undefined;
}
