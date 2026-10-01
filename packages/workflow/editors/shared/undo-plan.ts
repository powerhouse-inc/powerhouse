// Undo that steps over operations that are not the author's edits, such as
// the runtime's test and run facts, and redo of what it took back.
import {
  appliedOperations,
  baseReducerVersion,
  deriveScope,
  garbageCollect,
  garbageCollectV2,
  generateId,
  sortOperations,
  undoTarget,
  type Action,
  type BaseReducerVersion,
  type Operation,
  type PHDocument,
  type PHDocumentHeader,
  type StateReducer,
} from "@powerhousedao/shared/document-model";

export interface UndoPolicy {
  // Operation types undo passes over.
  skip: ReadonlySet<string>;
  // Rebuilds a skipped action that must outlive the undo; undefined drops it.
  // `undone` is the edit being taken back, e.g. the step a test was of.
  replay?: (action: Action, undone: readonly Action[]) => Action | undefined;
}

export interface UndoPlan {
  // UNDOs to dispatch: the skipped operations and the edit before them.
  undos: number;
  // Re-dispatched after the undos, oldest first.
  replay: Action[];
  // The edit the undos take back, oldest first; redo dispatches it again.
  undone: Action[];
}

// Actions of one edit share an id prefix, so undo takes them back together.
const GROUP_PREFIX = "undo-group:";

export function newUndoGroup(): string {
  return generateId();
}

export function groupedAction<A extends Action>(action: A, group: string): A {
  return { ...action, id: `${GROUP_PREFIX}${group}:${generateId()}` };
}

export function undoGroupOf(action: Action): string | undefined {
  if (!action.id.startsWith(GROUP_PREFIX)) return undefined;
  const end = action.id.indexOf(":", GROUP_PREFIX.length);
  return end > GROUP_PREFIX.length
    ? action.id.slice(GROUP_PREFIX.length, end)
    : undefined;
}

// A header without a version, as the GraphQL light client builds it, reads as
// 1; an unknown version throws.
export function undoProtocolVersion(
  header: PHDocumentHeader,
): BaseReducerVersion {
  if (header.protocolVersions?.["base-reducer"] === undefined) return 1;
  return baseReducerVersion(header);
}

// The operations still in effect: undone ones and the NOOPs removed. On
// base-reducer 3 these are the rows an UNDO can retract, one per UNDO;
// `applied` (from `deriveScope`) says which rows apply, and without it a row
// with a stored error counts as not applied.
export function effectiveOperations(
  operations: readonly Operation[],
  protocolVersion: BaseReducerVersion,
  applied?: ReadonlySet<string>,
): Operation[] {
  const sorted = sortOperations([...operations]);
  return keptOperations(sorted, protocolVersion, applied).filter(
    (operation) => operation.action.type !== "NOOP",
  );
}

function keptOperations(
  sorted: Operation[],
  protocolVersion: BaseReducerVersion,
  applied: ReadonlySet<string> | undefined,
): Operation[] {
  switch (protocolVersion) {
    case 1:
      return garbageCollect(sorted);
    case 2:
      return garbageCollectV2(sorted);
    case 3:
      return retractableOperations(sorted, applied);
    default: {
      const unknown: never = protocolVersion;
      throw new Error(`Unknown base-reducer version ${String(unknown)}`);
    }
  }
}

// What UNDO retracts on base-reducer 3: applied content. A stored error is
// diagnostic there, so `applied` overrides it.
function retractableOperations(
  sorted: Operation[],
  applied: ReadonlySet<string> | undefined,
): Operation[] {
  const rows = appliedOperations(sorted).filter(
    (operation) =>
      operation.action.type !== "UNDO" && operation.action.type !== "REDO",
  );
  if (!applied) return rows.filter((operation) => !operation.error);
  return rows
    .filter((operation) => applied.has(operation.action.id))
    .map((operation) =>
      operation.error ? { ...operation, error: undefined } : operation,
    );
}

// Base-reducer 3: the ids that apply in the global scope, derived with the
// model's state reducer as the reactor does when it resolves UNDO. Without the
// reducer, the rows not retracted, denied or marked with a stored error.
export function appliedForUndo(
  document: PHDocument,
  operations: readonly Operation[],
  reducer: StateReducer | undefined,
): ReadonlySet<string> {
  if (reducer) {
    return deriveScope(document, operations, () => reducer, "global").applied;
  }
  return new Set(
    effectiveOperations(operations, 3).map((operation) => operation.action.id),
  );
}

// Base-reducer 3: whether an UNDO has a row to retract.
export function canUndoOn3(
  document: PHDocument,
  operations: readonly Operation[],
  reducer: StateReducer | undefined,
): boolean {
  return (
    undoTarget(operations, appliedForUndo(document, operations, reducer)) !==
    undefined
  );
}

// Where the edit ending at `last` starts: back through its group's actions,
// passing over skipped and failed operations between them.
function editStart(
  effective: readonly Operation[],
  last: number,
  policy: UndoPolicy,
): number {
  const group = undoGroupOf(effective[last].action);
  if (!group) return last;
  let start = last;
  for (let index = last - 1; index >= 0; index--) {
    const { action, error } = effective[index];
    if (undoGroupOf(action) === group) start = index;
    else if (!error && !policy.skip.has(action.type)) break;
  }
  return start;
}

// Null when nothing but skipped operations is left to undo.
export function planUndo(
  effective: readonly Operation[],
  policy: UndoPolicy,
): UndoPlan | null {
  for (let last = effective.length - 1; last >= 0; last--) {
    const { action, error } = effective[last];
    // A failed operation changed nothing, so it is passed over too.
    if (error || policy.skip.has(action.type)) continue;
    const start = editStart(effective, last, policy);
    const group = undoGroupOf(action);
    const isMember = (candidate: Action) =>
      candidate === action ||
      (group !== undefined && undoGroupOf(candidate) === group);
    const applied = effective
      .slice(start)
      .filter((operation) => !operation.error)
      .map((operation) => operation.action);
    const undone = applied.filter(isMember);
    const replay = applied
      .filter((candidate) => !isMember(candidate))
      .map((candidate) => policy.replay?.(candidate, undone))
      .filter((kept): kept is Action => kept !== undefined);
    return { undos: effective.length - start, replay, undone };
  }
  return null;
}

// The last operation index in `operations`, or -1.
export function headIndex(operations: readonly Operation[]): number {
  return operations.reduce((head, op) => Math.max(head, op.index), -1);
}

// Whether an author edit landed after `head`, which voids pending redos.
export function editedSince(
  operations: readonly Operation[],
  head: number,
  policy: UndoPolicy,
): boolean {
  return operations.some(
    (op) =>
      op.index > head &&
      op.action.type !== "NOOP" &&
      !policy.skip.has(op.action.type),
  );
}

// A fresh action carrying an undone edit, to dispatch as its redo.
export function redoAction(action: Action): Action {
  return {
    id: generateId(),
    type: action.type,
    scope: action.scope,
    input: action.input,
    timestampUtcMs: new Date().toISOString(),
  };
}

// An undone edit's actions again, in a group of their own when there are several.
export function redoActions(actions: readonly Action[]): Action[] {
  if (actions.length <= 1) return actions.map(redoAction);
  const group = newUndoGroup();
  return actions.map((action) => groupedAction(redoAction(action), group));
}
