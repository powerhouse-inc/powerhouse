import type {
  Action,
  DocumentModelModule,
  Operation,
  PHBaseState,
  PHDocument,
  ReducerOptions,
} from "@powerhousedao/shared/document-model";
import {
  hashDocumentStateForScope,
  replayDocument,
} from "@powerhousedao/shared/document-model";
import { canonicalJson } from "../../src/definition/kernel/primitives.js";

export type AnyModule = DocumentModelModule<PHBaseState>;
export type AnyDocument = PHDocument<PHBaseState>;

export type HistoryStep = {
  readonly action: Action;
  readonly options?: ReducerOptions;
};

export type PrefixSnapshot = {
  readonly header: string;
  readonly state: string;
  readonly initialState: string;
  readonly hashes: Readonly<Record<string, string>>;
  readonly operations: string;
  readonly thrown: string | null;
};

function operationRows(document: AnyDocument) {
  return Object.keys(document.operations)
    .sort()
    .flatMap((scope) =>
      (document.operations[scope] ?? []).map((operation) => ({
        scope,
        index: operation.index,
        skip: operation.skip,
        type: operation.action.type,
        input: operation.action.input ?? null,
        error: operation.error ?? null,
      })),
    );
}

export function snapshot(
  document: AnyDocument,
  thrown: string | null = null,
): PrefixSnapshot {
  return {
    header: canonicalJson({
      name: document.header.name,
      documentType: document.header.documentType,
    }),
    state: canonicalJson(document.state),
    initialState: canonicalJson(document.initialState),
    hashes: Object.fromEntries(
      Object.keys(document.state)
        .sort()
        .map((scope) => [
          scope,
          hashDocumentStateForScope(
            document as unknown as { state: Record<string, unknown> },
            scope,
          ),
        ]),
    ),
    operations: canonicalJson(operationRows(document)),
    thrown,
  };
}

export type ReplayRun = {
  readonly snapshots: readonly PrefixSnapshot[];
  readonly documents: readonly AnyDocument[];
};

export function streamHistory(
  module: AnyModule,
  document: AnyDocument,
  steps: readonly HistoryStep[],
): ReplayRun {
  const documents = [document];
  const snapshots = [snapshot(document)];
  let current = document;
  for (const step of steps) {
    let thrown: string | null = null;
    try {
      current = module.reducer(current, step.action, undefined, {
        reuseOperationResultingState: false,
        ...step.options,
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }
    documents.push(current);
    snapshots.push(snapshot(current, thrown));
  }
  return { snapshots, documents };
}

const blanked = (operation: Operation): Operation => ({
  ...operation,
  hash: "",
  error: undefined,
  resultingState: undefined,
});

export function replayArchive(
  module: AnyModule,
  recorded: AnyDocument,
): AnyDocument {
  const operations = Object.fromEntries(
    Object.entries(recorded.operations).map(([scope, rows]) => [
      scope,
      rows.map(blanked),
    ]),
  );
  return replayDocument(
    recorded.initialState,
    operations,
    module.reducer,
    recorded.header,
    undefined,
    {},
    { reuseOperationResultingState: false },
  );
}

export type PrefixDifference = {
  readonly prefix: number;
  readonly coordinate: keyof PrefixSnapshot;
  readonly left: string;
  readonly right: string;
};

export function firstDifference(
  left: readonly PrefixSnapshot[],
  right: readonly PrefixSnapshot[],
): PrefixDifference | null {
  if (left.length !== right.length) {
    throw new Error(`${left.length} prefixes against ${right.length}.`);
  }
  for (const [prefix, ours] of left.entries()) {
    const theirs = right[prefix];
    for (const coordinate of Object.keys(ours) as (keyof PrefixSnapshot)[]) {
      const mine = canonicalJson(ours[coordinate]);
      const other = canonicalJson(theirs[coordinate]);
      if (mine !== other) {
        return { prefix, coordinate, left: mine, right: other };
      }
    }
  }
  return null;
}
