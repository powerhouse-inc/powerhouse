import type {
  Action,
  DocumentModelModule,
  Operation,
  PHBaseState,
  PHDocument,
  ReducerOptions,
  Signal,
} from "@powerhousedao/shared/document-model";
import { hashDocumentStateForScope } from "@powerhousedao/shared/document-model";
import { canonicalJson } from "../../src/definition/primitives.js";

/**
 * Cold prefix replay: the proof that two declarations of one model *behave*
 * the same on a real history, not only that they declare the same thing.
 *
 * ## Why the incoming hash is not the oracle
 *
 * `baseReducer` can copy an incoming operation hash during replay, and
 * `checkHashes` is inverted in both replay paths: its default `true` trusts
 * the incoming hash and `false` performs the comparison
 * (`shared/document-model/documents.ts`, `versioned-replay.ts`). A harness
 * that trusted `operation.hash` would prove nothing, so this one blanks
 * incoming hashes and recomputes every scope hash from the resulting state.
 * The inversion itself is a deferred protocol correction: fixing it here
 * would move the baseline being measured.
 *
 * ## Cost
 *
 * Each operation is submitted **once** to each implementation — `n` appends
 * per side, `2n` in total — and the two are compared after every append.
 * The platform's own internal replay (undo, redo, prune, upgrades) still
 * happens and stays observable; this bound is about harness submissions, not
 * about the total reducer work the platform does.
 */

/** One comparison point, taken after every append. */
export type PrefixSnapshot = {
  readonly append: number;
  readonly state: string;
  readonly initialState: string;
  /** Recomputed from the resulting state, never read from an operation. */
  readonly hashes: Readonly<Record<string, string>>;
  readonly revision: Readonly<Record<string, number>>;
  readonly operations: readonly OperationSnapshot[];
  readonly dispatches: readonly string[];
  /** The error the append itself threw, if the reducer rejected it outright. */
  readonly thrown: string | null;
};

export type OperationSnapshot = {
  readonly scope: string;
  readonly index: number;
  readonly skip: number;
  readonly type: string;
  /** `null` rather than absent, so the canonical encoder can compare it. */
  readonly error: string | null;
  readonly deniedReason: string | null;
  readonly action: string;
  readonly timestampUtcMs: string;
};

export type ReplayRun = {
  readonly snapshots: readonly PrefixSnapshot[];
  /** How many times the harness called the reducer. */
  readonly appends: number;
  readonly document: PHDocument<PHBaseState>;
};

/**
 * The platform synthesizes actions of its own — the NOOP an undo writes, for
 * one — and stamps them with `generateId()` and the wall clock. Those values
 * differ between any two runs and belong to the platform, not to the model,
 * so they are reported as a placeholder. Everything else about a synthesized
 * operation, including its type, scope, input, index, and skip, is compared.
 */
const PLATFORM_ASSIGNED = "<platform-assigned>";

function operationSnapshots(
  document: PHDocument<PHBaseState>,
  submitted: ReadonlySet<string>,
): readonly OperationSnapshot[] {
  const snapshots: OperationSnapshot[] = [];
  for (const scope of Object.keys(document.operations).sort()) {
    for (const operation of document.operations[scope] ?? []) {
      const authored = submitted.has(operation.action.id);
      snapshots.push({
        scope,
        index: operation.index,
        skip: operation.skip,
        type: operation.action.type,
        error: operation.error ?? null,
        deniedReason: operation.deniedReason ?? null,
        // The persisted action, including its input and scope, so a reducer
        // that rewrote either is visible at the prefix where it did.
        action: canonicalJson({
          id: authored ? operation.action.id : PLATFORM_ASSIGNED,
          type: operation.action.type,
          scope: operation.action.scope,
          input: operation.action.input ?? null,
          timestampUtcMs: authored
            ? operation.action.timestampUtcMs
            : PLATFORM_ASSIGNED,
        }),
        timestampUtcMs: authored ? operation.timestampUtcMs : PLATFORM_ASSIGNED,
      });
    }
  }
  return snapshots;
}

function recomputedHashes(
  document: PHDocument<PHBaseState>,
): Readonly<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const scope of Object.keys(document.state).sort()) {
    hashes[scope] = hashDocumentStateForScope(
      document as unknown as { state: Record<string, unknown> },
      scope,
    );
  }
  return hashes;
}

function revisions(
  document: PHDocument<PHBaseState>,
): Readonly<Record<string, number>> {
  const revision: Record<string, number> = {};
  for (const scope of Object.keys(document.header.revision).sort()) {
    revision[scope] = document.header.revision[scope];
  }
  return revision;
}

function snapshot(
  document: PHDocument<PHBaseState>,
  append: number,
  dispatches: readonly string[],
  thrown: string | null,
  submitted: ReadonlySet<string>,
): PrefixSnapshot {
  return {
    append,
    state: canonicalJson(document.state),
    initialState: canonicalJson(document.initialState),
    hashes: recomputedHashes(document),
    revision: revisions(document),
    operations: operationSnapshots(document, submitted),
    dispatches,
    thrown,
  };
}

export type HistoryStep = {
  readonly action: Action;
  readonly options?: ReducerOptions;
};

/**
 * Streams one history through one module, snapshotting after every append.
 * Replay shortcuts are off: no cached resulting state is reused, so every
 * prefix is recomputed from the initial state and the actions themselves.
 */
export function streamHistory(
  module: DocumentModelModule<PHBaseState>,
  document: PHDocument<PHBaseState>,
  history: readonly HistoryStep[],
): ReplayRun {
  const submitted = new Set(history.map((step) => step.action.id));
  const snapshots: PrefixSnapshot[] = [
    snapshot(document, 0, [], null, submitted),
  ];
  let current = document;
  let appends = 0;
  for (const [position, step] of history.entries()) {
    const dispatches: string[] = [];
    const record = (signal: Signal): void => {
      dispatches.push(
        canonicalJson({ type: signal.type, input: signal.input }),
      );
    };
    let thrown: string | null = null;
    try {
      current = module.reducer(current, step.action, record, {
        reuseOperationResultingState: false,
        ...step.options,
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }
    appends += 1;
    snapshots.push(
      snapshot(current, position + 1, dispatches, thrown, submitted),
    );
  }
  return { snapshots, appends, document: current };
}

export type PrefixDifference = {
  readonly append: number;
  readonly coordinate: string;
  readonly left: string;
  readonly right: string;
};

/**
 * The first prefix at which two runs disagree, on any coordinate. Divergence
 * followed by convergence is still a consensus defect, so the comparison is
 * per prefix rather than only on the final state.
 */
export function firstDifference(
  left: ReplayRun,
  right: ReplayRun,
): PrefixDifference | null {
  if (left.snapshots.length !== right.snapshots.length) {
    return {
      append: Math.min(left.snapshots.length, right.snapshots.length),
      coordinate: "snapshots.length",
      left: String(left.snapshots.length),
      right: String(right.snapshots.length),
    };
  }
  for (const [position, ours] of left.snapshots.entries()) {
    const theirs = right.snapshots[position];
    const coordinates: readonly (readonly [string, string, string])[] = [
      ["state", ours.state, theirs.state],
      ["initialState", ours.initialState, theirs.initialState],
      ["hashes", canonicalJson(ours.hashes), canonicalJson(theirs.hashes)],
      [
        "revision",
        canonicalJson(ours.revision),
        canonicalJson(theirs.revision),
      ],
      [
        "operations",
        canonicalJson(ours.operations),
        canonicalJson(theirs.operations),
      ],
      [
        "dispatches",
        canonicalJson(ours.dispatches),
        canonicalJson(theirs.dispatches),
      ],
      ["thrown", String(ours.thrown), String(theirs.thrown)],
    ];
    for (const [coordinate, mine, other] of coordinates) {
      if (mine !== other) {
        return { append: position, coordinate, left: mine, right: other };
      }
    }
  }
  return null;
}

/**
 * The raw, unpruned operation stream of a document, with incoming hashes
 * blanked and recorded errors cleared — what a cold replay is given when it
 * must not trust anything the previous run computed.
 */
export function rawStream(
  document: PHDocument<PHBaseState>,
): readonly Operation[] {
  return Object.values(document.operations)
    .flat()
    .sort((left, right) =>
      left.index === right.index
        ? left.timestampUtcMs.localeCompare(right.timestampUtcMs)
        : left.index - right.index,
    )
    .map((operation) => ({
      ...operation,
      hash: "",
      error: undefined,
      // A cached resulting state is a replay shortcut: dropping it forces
      // every prefix to be recomputed from the actions.
      resultingState: undefined,
    }));
}
