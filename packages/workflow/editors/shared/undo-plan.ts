// Undo that steps over operations that are not the author's edits, such as
// the runtime's test and run facts, and redo of what it took back.
import {
  baseReducerVersion,
  garbageCollect,
  garbageCollectV2,
  generateActionId,
  isDenied,
  isDocumentAction,
  positionalOperations,
  retract,
  retractedActionIds,
  sortOperations,
  type Action,
  type BaseReducerVersion,
  type CreateDocumentActionInput,
  type Operation,
  type PHDocumentHeader,
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
  return generateActionId();
}

export function groupedAction<A extends Action>(action: A, group: string): A {
  return { ...action, id: `${GROUP_PREFIX}${group}:${generateActionId()}` };
}

export function undoGroupOf(action: Action): string | undefined {
  if (!action.id.startsWith(GROUP_PREFIX)) return undefined;
  const end = action.id.indexOf(":", GROUP_PREFIX.length);
  return end > GROUP_PREFIX.length
    ? action.id.slice(GROUP_PREFIX.length, end)
    : undefined;
}

// The header's version; a header without one, as the GraphQL light client
// builds it, takes the version from the document's CREATE_DOCUMENT, else 1.
// An unknown version throws.
export function undoProtocolVersion(
  header: PHDocumentHeader,
  create?: Operation,
): BaseReducerVersion {
  if (header.protocolVersions?.["base-reducer"] !== undefined) {
    return baseReducerVersion(header);
  }
  const input =
    create?.action.type === "CREATE_DOCUMENT"
      ? (create.action.input as Partial<CreateDocumentActionInput> | undefined)
      : undefined;
  const version = input?.protocolVersions?.["base-reducer"];
  if (version === undefined) return 1;
  return baseReducerVersion({
    ...header,
    protocolVersions: { "base-reducer": version },
  });
}

// Base-reducer 1 and 2: the operations still in effect, undone ones and the
// NOOPs removed.
export function effectiveOperations(
  operations: readonly Operation[],
  protocolVersion: 1 | 2,
): Operation[] {
  const sorted = sortOperations([...operations]);
  return keptOperations(sorted, protocolVersion).filter(
    (operation) => operation.action.type !== "NOOP",
  );
}

function keptOperations(
  sorted: Operation[],
  protocolVersion: 1 | 2,
): Operation[] {
  switch (protocolVersion) {
    case 1:
      return garbageCollect(sorted);
    case 2:
      return garbageCollectV2(sorted);
    default: {
      const unknown: never = protocolVersion;
      throw new Error(`Unknown base-reducer version ${String(unknown)}`);
    }
  }
}

// Base-reducer 3: the live rows an undo may retract. Base actions, NOOPs,
// retractions and denied rows are not edits.
export function liveOperations(operations: readonly Operation[]): Operation[] {
  const rows = positionalOperations(operations);
  const retracted = retractedActionIds(rows);
  return rows.filter(
    (operation) =>
      !retracted.has(operation.action.id) &&
      !NOT_EDITS.has(operation.action.type) &&
      !isDocumentAction(operation.action) &&
      !isDenied(operation),
  );
}

const NOT_EDITS = new Set(["NOOP", "RETRACT", "UNDO", "REDO"]);

// Base-reducer 3: the ids undo retracts, the live rows of the last edit
// outside `policy.skip`; null when there is none. A row that threw is
// retracted too, which changes nothing.
export function planRetraction(
  operations: readonly Operation[],
  policy: UndoPolicy,
): string[] | null {
  const live = liveOperations(operations);
  const last = live.findLast(
    (operation) => !policy.skip.has(operation.action.type),
  );
  if (!last) return null;
  const group = undoGroupOf(last.action);
  if (group === undefined) return [last.action.id];
  return live
    .filter((operation) => undoGroupOf(operation.action) === group)
    .map((operation) => operation.action.id);
}

export function canUndoOn3(
  operations: readonly Operation[],
  policy: UndoPolicy,
): boolean {
  return planRetraction(operations, policy) !== null;
}

// One RETRACT per id, sent together.
export function retractions(
  ids: readonly string[],
  scope = "global",
): Action[] {
  return ids.map((id) => retract(id, scope));
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
    id: generateActionId(),
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
