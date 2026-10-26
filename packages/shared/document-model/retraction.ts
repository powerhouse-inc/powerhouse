import { castDraft, create, unsafe } from "mutative";
import type { Action } from "./actions.js";
import { baseActionReducer } from "./base-action-reducer.js";
import type { BaseReducerCapabilities } from "./base-reducer-protocol.js";
import { derivesByRule, RULE_EXEMPT_SCOPES } from "./base-reducer-protocol.js";
import { isDenied } from "./denied.js";
import type { PHDocument } from "./documents.js";
import {
  garbageCollect,
  isDocumentAction,
  sortOperations,
} from "./operation-order.js";
import type { Operation } from "./operations.js";
import type { PHBaseState } from "./state.js";
import type { UndoRedoTargets } from "./undo-redo-plan.js";
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

/** A stored row that changes which earlier rows apply: a RETRACT, or one a retraction names. */
export function retractionRewrites(
  row: { action: Action },
  named: (actionId: string) => boolean,
): boolean {
  return row.action.type === "RETRACT" || named(row.action.id);
}

/** Under the rule, appending `row` re-derives its scope from every row. */
function rewritesScope(
  row: { skip: number; action: Action },
  named: (actionId: string) => boolean,
): boolean {
  return row.skip > 0 || retractionRewrites(row, named);
}

export function retractionTarget(operation: Operation): string | undefined {
  return targetOf(operation.action);
}

/** The action ids `action` names; stores index exactly these for findReferencing. */
export function actionReferences(action: Action): string[] {
  const target = targetOf(action);
  return target === undefined ? [] : [target];
}

function targetOf(action: Action): string | undefined {
  if (action.type !== "RETRACT") return undefined;
  const input = action.input as Partial<RetractActionInput> | null;
  return typeof input?.target === "string" ? input.target : undefined;
}

/** Ids a live retraction names; a retraction is live iff no live retraction names it. */
export function retractedActionIds(rows: readonly Operation[]): Set<string> {
  const present = new Map<string, Operation>();
  const duplicated = new Set<string>();
  for (const operation of rows) {
    const id = operation.action.id;
    if (present.has(id)) duplicated.add(id);
    present.set(id, operation);
  }
  // A denied retraction, one whose id is not unique, or one naming a base
  // action (whose header effect no derivation resets) retracts nothing.
  const targetOf = new Map<string, string>();
  for (const operation of rows) {
    if (isDenied(operation) || duplicated.has(operation.action.id)) continue;
    const target = retractionTarget(operation);
    if (
      target !== undefined &&
      target !== operation.action.id &&
      present.has(target) &&
      !isDocumentAction(present.get(target)!.action)
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
  const ready = [...present.keys()].filter((id) => !pending.has(id));
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
export type ReducerFor<TState extends PHBaseState = PHBaseState> = (
  operation: Operation,
) => StateReducer<TState>;

/** Applies one row's action to the scope state; throws when the action throws. */
export function reduceOne<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  operation: Operation,
  reducerFor: ReducerFor<TState>,
): PHDocument<TState> {
  assertDerivedScope(operation.action.scope);
  return applyRow(document, operation, rowReducer(operation, reducerFor));
}

/** Receives a row whose action threw while deriving a scope. */
export type OnThrow = (operation: Operation, error: unknown) => void;

/** Which reducer each row of a scope takes, and the upgrades between model versions. */
export type ScopeVersions = {
  /** The model version a row applies under. */
  versionOf: (operation: Operation) => number;
  /** The state reducer of a model version. */
  reducerOf: (version: number) => StateReducer;
  /** Applies the held-back upgrades through `version`; called before every row. */
  upgradeTo: <TState extends PHBaseState>(
    document: PHDocument<TState>,
    version: number,
  ) => PHDocument<TState>;
};

/**
 * Base-reducer 3 derivation of one scope, advanced a run of rows at a time.
 * Which rows apply is decided once, over the whole stream; `applied` collects
 * the ids whose action did not throw.
 */
export function scopeDeriver(
  stream: readonly Operation[],
  onThrow?: OnThrow,
): {
  applied: ReadonlySet<string>;
  advance<TState extends PHBaseState>(
    document: PHDocument<TState>,
    rows: readonly Operation[],
    reducerFor: ReducerFor<TState>,
  ): PHDocument<TState>;
} {
  // By reference: a rewound row and its re-appended copy share an id.
  const live = new Set(appliedOperations(stream));
  const applied = new Set<string>();
  return {
    applied,
    advance(document, rows, reducerFor) {
      let next = document;
      for (const operation of rows) {
        if (!live.has(operation)) continue;
        assertDerivedScope(operation.action.scope);
        // Resolved outside the try: a model without a state reducer must fail.
        const reducer = rowReducer(operation, reducerFor);
        try {
          next = applyRow(next, operation, reducer);
          applied.add(operation.action.id);
        } catch (error) {
          // A row that throws applies nothing.
          onThrow?.(operation, error);
        }
      }
      return next;
    },
  };
}

function resetScope<TState extends PHBaseState>(
  document: PHDocument<TState>,
  scope: string,
): PHDocument<TState> {
  assertDerivedScope(scope);
  const initial = (document.initialState as Record<string, unknown>)[scope];
  return {
    ...document,
    state: { ...document.state, [scope]: initial } as TState,
  };
}

/** Derives `scope` from initial state; `applied` holds the ids whose action did not throw. */
export function deriveScope<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  stream: readonly Operation[],
  reducerFor: ReducerFor<TState>,
  scope: string | undefined = stream.at(0)?.action.scope,
  onThrow?: OnThrow,
): { document: PHDocument<TState>; applied: ReadonlySet<string> } {
  if (scope === undefined) {
    return { document, applied: new Set() };
  }
  const deriver = scopeDeriver(stream, onThrow);
  const next = deriver.advance(
    resetScope(document, scope),
    positionalOperations(stream),
    reducerFor,
  );
  return { document: next, applied: deriver.applied };
}

/**
 * Derives `scope` from initial state across model versions: each row applies
 * with its own version's reducer, and each upgrade applies where its boundary
 * falls. Every row is visited, applied or not, so an upgrade a skipped row
 * crosses still applies there.
 */
export function deriveScopeVersioned<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  stream: readonly Operation[],
  versions: ScopeVersions,
  scope: string | undefined = stream.at(0)?.action.scope,
  onThrow?: OnThrow,
): { document: PHDocument<TState>; applied: ReadonlySet<string> } {
  if (scope === undefined) {
    return { document, applied: new Set() };
  }
  const deriver = scopeDeriver(stream, onThrow);
  let next = resetScope(document, scope);
  for (const operation of sortOperations([...stream])) {
    const version = versions.versionOf(operation);
    next = versions.upgradeTo(next, version);
    // Versions differ in state type; each reducer applies to its own version's state.
    next = deriver.advance(
      next,
      [operation],
      () => versions.reducerOf(version) as unknown as StateReducer<TState>,
    );
  }
  return { document: next, applied: deriver.applied };
}

function assertDerivedScope(scope: string): void {
  if (RULE_EXEMPT_SCOPES.has(scope)) {
    throw new Error(`Base-reducer 3 does not derive the ${scope} scope`);
  }
}

function rowReducer<TState extends PHBaseState>(
  operation: Operation,
  reducerFor: ReducerFor<TState>,
): StateReducer<TState> | undefined {
  const action = operation.action;
  if (
    action.type === "NOOP" ||
    action.type === "RETRACT" ||
    isDocumentAction(action)
  ) {
    return undefined;
  }
  return reducerFor(operation);
}

function applyRow<TState extends PHBaseState>(
  document: PHDocument<TState>,
  operation: Operation,
  reducer: StateReducer<TState> | undefined,
): PHDocument<TState> {
  const action = operation.action;
  if (isDocumentAction(action)) {
    return baseActionReducer(document, action);
  }
  if (reducer === undefined) {
    return document;
  }
  return create(document, (draft) => {
    const next = reducer(draft.state, action);
    if (next) {
      unsafe(() => {
        draft.state = castDraft(next);
      });
    }
  });
}

function isContent(operation: Operation | undefined): boolean {
  return (
    operation !== undefined &&
    operation.action.type !== "RETRACT" &&
    operation.action.type !== "NOOP" &&
    !isDocumentAction(operation.action) &&
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
    if (retracted.has(operation.action.id) || isDenied(operation)) continue;
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

/**
 * The targets of `scope` derived from the rows `document` holds; for a client
 * holding the whole log. None where the rule does not derive `scope`.
 */
export function undoRedoTargetsOf<TState extends PHBaseState>(
  document: PHDocument<TState>,
  caps: BaseReducerCapabilities,
  scope: string,
  reducer: StateReducer<TState>,
): UndoRedoTargets {
  if (!derivesByRule(caps, scope)) return {};
  const rows = document.operations[scope] ?? [];
  const { applied } = deriveScope(document, rows, () => reducer, scope);
  return {
    undoTarget: undoTarget(rows, applied),
    redoTarget: redoTarget(rows, applied),
  };
}

/** What a stream's targets advance from: the targets, and the ids that make a row rewrite. */
export type UndoTargetsBase = {
  targets: UndoRedoTargets;
  /** Every id a RETRACT in the stream names, present or not. */
  named: ReadonlySet<string>;
};

/** The targets of a fully derived stream, with what advancing them needs. */
export function undoTargetsBase(
  stream: readonly Operation[],
  applied: ReadonlySet<string>,
): UndoTargetsBase {
  const named = new Set<string>();
  for (const operation of stream) {
    const target = retractionTarget(operation);
    if (target !== undefined) named.add(target);
  }
  return {
    targets: {
      undoTarget: undoTarget(stream, applied),
      redoTarget: redoTarget(stream, applied),
    },
    named,
  };
}

/** What a stream holds before a tail appended to it. */
export type TailBase = {
  /** Whether a stored RETRACT names `actionId`, present or not. */
  readonly named: (actionId: string) => boolean;
};

/**
 * Whether `tail`, rows appended in index order after a derived base, applies
 * row by row. Not when a row rewinds, retracts, or is named by a retraction.
 * Admission refuses a repeated action id, so no tail row repeats one.
 */
export function tailAppliesIncrementally(
  tail: readonly { skip: number; action: Action }[],
  base: TailBase,
): boolean {
  return !tail.some((row) => rewritesScope(row, base.named));
}

/**
 * The targets after `appended`, rows past the end of `base`'s stream in index
 * order; "rederive" unless the tail applies incrementally. A row's stored
 * `error` says whether it applied.
 */
export function advanceUndoTargets(
  base: Pick<UndoTargetsBase, "targets" | "named">,
  appended: readonly Operation[],
): UndoRedoTargets | "rederive" {
  const applies = tailAppliesIncrementally(appended, {
    named: (id) => base.named.has(id),
  });
  if (!applies) return "rederive";
  let { undoTarget: undo, redoTarget: redo } = base.targets;
  for (const operation of appended) {
    if (isContent(operation) && operation.error === undefined) {
      undo = operation.action.id;
      redo = undefined;
    }
  }
  return { undoTarget: undo, redoTarget: redo };
}
