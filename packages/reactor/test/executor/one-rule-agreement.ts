import type {
  Action,
  Operation,
  PHDocument,
  Reducer,
  ReducerFor,
  VersionedReplayConfig,
} from "@powerhousedao/shared/document-model";
import {
  baseLoadFromInput,
  baseLoadFromInputVersioned,
  baseReducerVersion,
  createZip,
  deriveOperationId,
  deriveScope,
  documentModelStateReducer,
  replayDocument,
  replayDocumentVersioned,
  retract,
  setModelName,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { expect, vi } from "vitest";
import { scopeDerivation } from "../../src/derivation/index.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";

export type AgreementTarget = {
  module: InProcessReactorModule;
  /** As passed to create: a served document's initialState is its current state. */
  document: PHDocument;
  scope?: string;
  branch?: string;
  /** The document model's by default. */
  reducerFor?: ReducerFor;
  /** The document model's by default. */
  reducer?: Reducer<any>;
  /** Action ids whose stored row may carry an error. */
  allowErrors?: readonly string[];
  /** Revisions rebuilt historically; every row's when short, else a sample. */
  revisions?: readonly number[];
  /** Whether a keyframe must exist; build with a small `keyframeInterval`. */
  expectKeyframe?: boolean;
  /**
   * A document with model upgrades: derived by version, replayed and loaded
   * through the versioned paths, and without the single-reducer sequential
   * path. Pass `revisions` at or after the last upgrade's boundary.
   */
  versioned?: {
    registry: IDocumentModelRegistry;
    config: VersionedReplayConfig;
  };
};

export type AgreementResult = {
  rows: Operation[];
  expected: unknown;
  applied: ReadonlySet<string>;
};

const SAMPLED_REVISIONS = 12;
const SEED_CHUNK = 500;

function failure(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : String(error) };
}

async function attempt(path: () => unknown): Promise<unknown> {
  try {
    return await path();
  } catch (error) {
    return failure(error);
  }
}

export async function storedRows(
  module: InProcessReactorModule,
  documentId: string,
  scope = "global",
  branch = "main",
): Promise<Operation[]> {
  const result = await module.operationStore.getSince(
    documentId,
    scope,
    branch,
    -1,
  );
  return result.results;
}

/** The document before any row of `scope` applied. */
function beforeScope(document: PHDocument, scope: string): PHDocument {
  return {
    ...document,
    state: {
      ...document.state,
      [scope]: (document.initialState as Record<string, unknown>)[scope],
    },
    operations: { ...document.operations, [scope]: [] },
    clipboard: [],
  };
}

function revisionsOf(rows: Operation[]): number[] {
  const indexes = rows.map((operation) => operation.index);
  if (indexes.length <= SAMPLED_REVISIONS) {
    return indexes;
  }
  const step = indexes.length / SAMPLED_REVISIONS;
  const sample = new Set<number>();
  for (let i = 0; i < SAMPLED_REVISIONS; i++) {
    sample.add(indexes[Math.floor(i * step)]);
  }
  sample.add(indexes.at(-1)!);
  return [...sample];
}

/** Each derivation path equals `deriveScope` over the stored rows. */
export async function assertOneRuleAgreement(
  target: AgreementTarget,
): Promise<AgreementResult> {
  const {
    module,
    document,
    scope = "global",
    branch = "main",
    reducerFor = () => documentModelStateReducer as never,
    allowErrors = [],
    expectKeyframe = true,
  } = target;
  const reducer: Reducer<any> =
    target.reducer ?? (documentModelDocumentModelModule.reducer as never);
  const { writeCache } = module;
  const documentId = document.header.id;

  const rows = await storedRows(module, documentId, scope, branch);
  const served = await module.reactor.get<PHDocument>(documentId, {
    branch,
  });
  const header = served.header;
  const initial = beforeScope(
    { ...served, initialState: document.initialState },
    scope,
  );
  const stateOf = (document: PHDocument) =>
    (document.state as Record<string, unknown>)[scope];
  const versioned = target.versioned;
  const deriveByVersion =
    versioned &&
    (await scopeDerivation(
      module.operationStore,
      versioned.registry,
      documentId,
      branch,
    ));
  const derive = (stream: readonly Operation[]) =>
    deriveByVersion
      ? deriveByVersion(initial, stream, scope)
      : deriveScope(initial, stream, reducerFor);
  const documentRows = await storedRows(module, documentId, "document", branch);

  const derived = derive(rows);
  const expected = stateOf(derived.document);
  const revisions = target.revisions ?? revisionsOf(rows);
  const head = rows.at(-1)?.index;

  const rebuildAt = async (revision?: number) => {
    writeCache.invalidate(documentId);
    return stateOf(
      await writeCache.getState(documentId, scope, branch, revision),
    );
  };

  const keyframe = await attempt(async () => {
    if (head === undefined) {
      return expected;
    }
    if (expectKeyframe) {
      await vi
        .waitUntil(
          async () =>
            (
              await module.keyframeStore.listKeyframes(
                documentId,
                scope,
                branch,
              )
            ).length > 0,
          { timeout: 2000, interval: 20 },
        )
        .catch(() => {
          throw new Error("no keyframe was written");
        });
    }
    return rebuildAt(head);
  });

  const historical: Record<number, unknown> = {};
  const historicalExpected: Record<number, unknown> = {};
  for (const revision of revisions) {
    historicalExpected[revision] = stateOf(
      derive(rows.filter((operation) => operation.index <= revision)).document,
    );
    historical[revision] = await attempt(() => rebuildAt(revision));
  }

  const cold = await attempt(() => rebuildAt());

  const replayOptions = { checkHashes: false, skipIndexValidation: true };
  const replay = await attempt(() =>
    stateOf(
      versioned
        ? replayDocumentVersioned(
            document.initialState,
            { document: documentRows, [scope]: rows },
            versioned.config,
            header,
            undefined,
            replayOptions,
          )
        : replayDocument(
            document.initialState,
            { [scope]: rows },
            reducer,
            header,
            undefined,
            {},
            replayOptions,
          ),
    ),
  );

  const phd = await attempt(async () => {
    const exported: PHDocument = {
      ...served,
      initialState: document.initialState,
      operations: { document: documentRows, [scope]: rows },
      clipboard: [],
    };
    const zip = await createZip(exported);
    return stateOf(
      versioned
        ? await baseLoadFromInputVersioned(zip, versioned.config)
        : await baseLoadFromInput(zip, reducer),
    );
  });

  const sequential = await attempt(() => {
    if (versioned) {
      return expected;
    }
    const protocolVersion = baseReducerVersion(header);
    let current = initial;
    for (const operation of rows) {
      current = reducer(current, operation.action, undefined, {
        skip: operation.skip,
        protocolVersion,
        replayOptions: { operation },
        skipIndexValidation: true,
      });
    }
    return stateOf(current);
  });

  const allowed = new Set(allowErrors);
  const rowErrors = rows
    .filter((operation) => operation.error && !allowed.has(operation.action.id))
    .map((operation) => `${operation.index}: ${operation.error}`);

  expect({
    served: stateOf(served),
    cold,
    keyframe,
    historical,
    replay,
    phd,
    sequential,
    rowErrors,
  }).toEqual({
    served: expected,
    cold: expected,
    keyframe: expected,
    historical: historicalExpected,
    replay: expected,
    phd: expected,
    sequential: expected,
    rowErrors: [],
  });

  return { rows, expected, applied: derived.applied };
}

/** Constant-size rows; every tenth is a RETRACT of the row before. */
export async function seedLongStream(
  module: InProcessReactorModule,
  document: PHDocument,
  count: number,
  scope = "global",
): Promise<void> {
  const documentId = document.header.id;
  const first = Date.now() - count - 60_000;
  const operations: Operation[] = [];
  let previous: string | undefined;
  for (let index = 0; index < count; index++) {
    const timestampUtcMs = new Date(first + index).toISOString();
    const base: Action =
      index % 10 === 9 && previous !== undefined
        ? retract(previous, scope)
        : setModelName({ name: `name-${index}` });
    const action: Action = { ...base, scope, timestampUtcMs };
    if (action.type !== "RETRACT") {
      previous = action.id;
    }
    operations.push({
      id: deriveOperationId(documentId, scope, "main", action.id),
      index,
      skip: 0,
      hash: "",
      timestampUtcMs,
      action,
    });
  }
  // One insert of thousands of rows exceeds PGlite's message size.
  for (let start = 0; start < operations.length; start += SEED_CHUNK) {
    await module.operationStore.apply(
      documentId,
      document.header.documentType,
      scope,
      "main",
      start,
      (txn) => {
        txn.addOperations(...operations.slice(start, start + SEED_CHUNK));
      },
    );
  }
}

/** Median wall time of `runs` cold rebuilds at head. */
export async function timeColdRebuild(
  module: InProcessReactorModule,
  documentId: string,
  scope = "global",
  runs = 3,
): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    module.writeCache.invalidate(documentId);
    const started = performance.now();
    await module.writeCache.getState(documentId, scope, "main");
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
