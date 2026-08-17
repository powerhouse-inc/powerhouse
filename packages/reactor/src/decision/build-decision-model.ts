import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { DocumentNotFoundError } from "../shared/errors.js";
import type { AppendConditionStream } from "../storage/interfaces.js";
import type {
  BuiltDecisionModel,
  DecisionModel,
  DecisionTarget,
  IStreamStateReader,
  Projection,
  ReadStream,
  StreamHistory,
  StreamQuery,
} from "./types.js";

type StreamRead = {
  state: unknown;
  stream: AppendConditionStream;
};

/**
 * Reads each projection's stream through the supplied reader, recording the
 * revision observed. Static projections resolve first; derived projections
 * see only those and contribute a map from document id to state. Each
 * distinct stream is read once and yields one append condition entry.
 */
export async function buildDecisionModel<M>(
  reader: IStreamStateReader,
  definition: (target: DecisionTarget) => DecisionModel<M>,
  target: DecisionTarget,
  signal?: AbortSignal,
): Promise<BuiltDecisionModel<M>> {
  const decisionModel = definition(target);
  const projections = Object.entries(decisionModel.projections) as Array<
    [string, Projection<M>]
  >;

  const reads = new Map<string, StreamRead>();
  const model: Record<string, unknown> = {};

  for (const [key, projection] of projections) {
    if (typeof projection.query === "function") {
      continue;
    }

    const read = await readStream(reader, projection.query, reads, signal);
    model[key] = read.state;
  }

  const staticModel = { ...model } as Partial<M>;

  for (const [key, projection] of projections) {
    if (typeof projection.query !== "function") {
      continue;
    }

    const queries = projection.query(staticModel);
    const value: Record<string, unknown> = {};
    for (const query of queries) {
      // A derived stream can name a document this replica does not hold (a
      // group not yet synced, or never reachable). It stays out of the model,
      // which fails closed, but its condition entry still guards the append:
      // the document arriving with operations before commit is a conflict.
      let read: StreamRead;
      try {
        read = await readStream(reader, query, reads, signal);
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          recordEmptyStream(query, reads);
          continue;
        }
        throw error;
      }
      value[query.documentId] = read.state;
    }

    model[key] = value;
  }

  const streams = [...reads.values()].map((read) => read.stream);

  return {
    model: model as M,
    appendCondition: { streams },
  };
}

/** Guards a stream that holds nothing yet: any operation appearing is growth. */
function recordEmptyStream(
  query: StreamQuery,
  reads: Map<string, StreamRead>,
): void {
  const key = `${query.documentId}:${query.scope}:${query.branch}`;
  if (reads.has(key)) {
    return;
  }
  reads.set(key, {
    state: undefined,
    stream: {
      documentId: query.documentId,
      scope: query.scope,
      branch: query.branch,
      revision: -1,
    },
  });
}

async function readStream(
  reader: IStreamStateReader,
  query: StreamQuery,
  reads: Map<string, StreamRead>,
  signal?: AbortSignal,
): Promise<StreamRead> {
  const key = `${query.documentId}:${query.scope}:${query.branch}`;
  const existing = reads.get(key);
  if (existing) {
    return existing;
  }

  const document = await reader.getState(
    query.documentId,
    query.scope,
    query.branch,
    undefined,
    signal,
  );

  const read: StreamRead = {
    state: (document.state as Record<string, unknown>)[query.scope],
    stream: {
      documentId: query.documentId,
      scope: query.scope,
      branch: query.branch,
      revision: observedRevision(document, query.scope),
    },
  };

  reads.set(key, read);
  return read;
}

/**
 * The highest operation index the document reflects for the scope, or -1 if
 * empty. `header.revision` is authoritative, not the rebuilt operation list.
 */
function observedRevision(document: PHDocument, scope: string): number {
  if (scope in document.header.revision) {
    return document.header.revision[scope] - 1;
  }

  if (scope in document.operations) {
    const operations = document.operations[scope];
    if (operations.length > 0) {
      return operations[operations.length - 1].index;
    }
  }

  if (!(scope in document.header.revision)) {
    return -1;
  }

  return document.header.revision[scope] - 1;
}

/** A derived projection, named; its streams are known only per evaluated range. */
export type DerivedProjection = {
  name: string;
  decidingActions: string[];
  apply: (document: PHDocument, operation: Operation) => PHDocument;
  queryOverHistory?: (reads: StreamHistory[]) => StreamQuery[];
};

/**
 * The projections whose queries depend on folded state. A positional walk
 * resolves their streams through `queryOverHistory`; a projection without one
 * contributes no streams to a walk.
 */
export function derivedReadSet<M>(
  definition: DecisionModel<M>,
): DerivedProjection[] {
  const projections: DerivedProjection[] = [];

  for (const [name, projection] of Object.entries(
    definition.projections,
  ) as Array<[string, Projection<M>]>) {
    if (typeof projection.query !== "function") {
      continue;
    }
    projections.push({
      name,
      decidingActions: projection.decidingActions,
      apply: projection.apply,
      queryOverHistory: projection.queryOverHistory,
    });
  }

  return projections;
}

/**
 * The streams a model reads whose queries are known before it is built. A
 * derived query needs the statically-queried projections first, so it is not
 * included here.
 */
export function staticReadSet<M>(definition: DecisionModel<M>): ReadStream[] {
  const streams: ReadStream[] = [];

  for (const [name, projection] of Object.entries(
    definition.projections,
  ) as Array<[string, Projection<M>]>) {
    if (typeof projection.query === "function") {
      continue;
    }
    streams.push({
      name,
      query: projection.query,
      decidingActions: projection.decidingActions,
      apply: projection.apply,
    });
  }

  return streams;
}
