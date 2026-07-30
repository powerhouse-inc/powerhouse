import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { AppendConditionStream } from "../storage/interfaces.js";
import type {
  BuiltDecisionModel,
  DecisionModel,
  DecisionTarget,
  Projection,
  ReadStream,
  StreamQuery,
} from "./types.js";

type StreamRead = {
  state: unknown;
  stream: AppendConditionStream;
};

/**
 * Reads each projection's stream through the write cache, recording the
 * revision observed. Static projections resolve first; derived projections
 * see only those and contribute a map from document id to state. Each
 * distinct stream is read once and yields one append condition entry.
 */
export async function buildDecisionModel<M>(
  cache: IWriteCache,
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

    const read = await readStream(cache, projection.query, reads, signal);
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
      const read = await readStream(cache, query, reads, signal);
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

async function readStream(
  cache: IWriteCache,
  query: StreamQuery,
  reads: Map<string, StreamRead>,
  signal?: AbortSignal,
): Promise<StreamRead> {
  const key = `${query.documentId}:${query.scope}:${query.branch}`;
  const existing = reads.get(key);
  if (existing) {
    return existing;
  }

  const document = await cache.getState(
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

/**
 * The streams a model reads whose queries are known before it is built. A
 * derived query needs the statically-queried projections first, so it is not
 * included here.
 */
export function staticReadSet<M>(definition: DecisionModel<M>): ReadStream[] {
  const streams: ReadStream[] = [];

  for (const projection of Object.values(definition.projections) as Array<
    Projection<M>
  >) {
    if (typeof projection.query === "function") {
      continue;
    }
    streams.push({
      query: projection.query,
      decidingActions: projection.decidingActions,
    });
  }

  return streams;
}
