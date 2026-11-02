// Undo that steps over operations that are not the author's edits, such as
// the runtime's test and run facts, and redo of what it took back.
import {
  creationState,
  deriveScope,
  garbageCollect,
  garbageCollectV2,
  generateActionId,
  generateId,
  groupedActionId,
  isDenied,
  isDocumentAction,
  positionalOperations,
  retract,
  retractedActionIds,
  sortOperations,
  stateReducerOf,
  undoCapabilitiesOf,
  undoGroupOfId,
  type Action,
  type BaseReducerCapabilities,
  type CreateDocumentActionInput,
  type Operation,
  type PHBaseState,
  type PHDocument,
  type PHDocumentHeader,
  type Reducer,
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

// Actions of one edit share their group in the id, so undo takes them back
// together. Base-reducer 3 orders by action id, so there the id leads with a
// fresh UUIDv7 (`<id>~ug:<group>`); below it the id keeps the
// `undo-group:<group>:<UUIDv4>` form.
const GROUP_PREFIX = "undo-group:";

// Whether the document orders by action id: base-reducer 3.
function ordersByActionId(caps: BaseReducerCapabilities | undefined): boolean {
  return caps?.tieOrder === "canonical";
}

export function newUndoGroup(caps?: BaseReducerCapabilities): string {
  return ordersByActionId(caps) ? generateActionId() : generateId();
}

export function groupedAction<A extends Action>(
  action: A,
  group: string,
  caps?: BaseReducerCapabilities,
): A {
  const id = ordersByActionId(caps)
    ? groupedActionId(generateActionId(), group)
    : `${GROUP_PREFIX}${group}:${generateId()}`;
  return { ...action, id };
}

export function undoGroupOf(action: Action): string | undefined {
  return undoGroupOfId(action.id);
}

// A header without a version, as the GraphQL light client builds it, takes it
// from CREATE_DOCUMENT; undefined when neither names one. A number this build
// does not know runs as base-reducer 3.
export function documentCapabilities(
  header: PHDocumentHeader,
  create?: Operation,
): BaseReducerCapabilities | undefined {
  const input =
    create?.action.type === "CREATE_DOCUMENT"
      ? (create.action.input as Partial<CreateDocumentActionInput> | undefined)
      : undefined;
  return undoCapabilitiesOf(header, input);
}

// Whether undo retracts rows by id: base-reducer 3.
export function isRetractionDocument(
  header: PHDocumentHeader,
  create?: Operation,
): boolean {
  return documentCapabilities(header, create)?.undo === "retraction";
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

// Base-reducer 3: the ids of `history` whose action applies, derived from
// the state the document scope's creation recorded, as the reactor does.
export function appliedActionIds<TState extends PHBaseState>(
  document: PHDocument,
  documentScope: readonly Operation[],
  history: readonly Operation[],
  reducer: Reducer<TState>,
): ReadonlySet<string> {
  const stateReducer = stateReducerOf(reducer);
  if (stateReducer === undefined) {
    throw new Error(
      `Document model ${document.header.documentType} has no state reducer to resolve undo targets with`,
    );
  }
  const seeded = {
    ...document,
    initialState: creationState(documentScope) ?? document.initialState,
  } as PHDocument<TState>;
  return deriveScope(seeded, history, () => stateReducer, "global").applied;
}

// Base-reducer 3: the ids undo retracts, every live row of the last edit
// outside `policy.skip` that `applied` holds; null when there is none.
// `applied` is what deriveScope reports: a stored row's error may be stale.
export function planRetraction(
  operations: readonly Operation[],
  policy: UndoPolicy,
  applied: ReadonlySet<string>,
): string[] | null {
  const live = liveOperations(operations);
  const last = live.findLast(
    (operation) =>
      !policy.skip.has(operation.action.type) &&
      applied.has(operation.action.id),
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
  applied: ReadonlySet<string>,
): boolean {
  return planRetraction(operations, policy, applied) !== null;
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
export function redoAction(
  action: Action,
  caps?: BaseReducerCapabilities,
): Action {
  return {
    id: ordersByActionId(caps) ? generateActionId() : generateId(),
    type: action.type,
    scope: action.scope,
    input: action.input,
    timestampUtcMs: new Date().toISOString(),
  };
}

// An undone edit's actions again, in a group of their own when there are several.
export function redoActions(
  actions: readonly Action[],
  caps?: BaseReducerCapabilities,
): Action[] {
  if (actions.length <= 1) {
    return actions.map((action) => redoAction(action, caps));
  }
  const group = newUndoGroup(caps);
  return actions.map((action) =>
    groupedAction(redoAction(action, caps), group, caps),
  );
}
