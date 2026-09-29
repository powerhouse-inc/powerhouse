// Undo that steps over operations that are not the author's edits, such as
// the runtime's test and run facts, and redo of what it took back.
import {
  garbageCollect,
  garbageCollectV2,
  generateId,
  sortOperations,
  type Action,
  type Operation,
} from "@powerhousedao/shared/document-model";

export interface UndoPolicy {
  // Operation types undo passes over.
  skip: ReadonlySet<string>;
  // Rebuilds a skipped action that must outlive the undo; undefined drops it.
  replay?: (action: Action) => Action | undefined;
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

// The operations still in effect: undone ones and the NOOPs removed.
export function effectiveOperations(
  operations: readonly Operation[],
  protocolVersion: number,
): Operation[] {
  const sorted = sortOperations([...operations]);
  const kept =
    protocolVersion >= 2 ? garbageCollectV2(sorted) : garbageCollect(sorted);
  return kept.filter((operation) => operation.action.type !== "NOOP");
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
    const replay: Action[] = [];
    const undone: Action[] = [];
    for (const operation of effective.slice(start)) {
      if (operation.error) continue;
      const member =
        operation.action === action ||
        (group !== undefined && undoGroupOf(operation.action) === group);
      if (member) {
        undone.push(operation.action);
        continue;
      }
      const kept = policy.replay?.(operation.action);
      if (kept) replay.push(kept);
    }
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
