import type {
  AuthSubject,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { DocumentNotFoundError } from "../shared/errors.js";
import { derivedReadSet, staticReadSet } from "./build-decision-model.js";
import { streamKey } from "./merged-order.js";
import type {
  DecisionModel,
  DecisionStores,
  DecisionTarget,
  EvaluationSubject,
  ReadStream,
  StreamHistory,
  StreamQuery,
} from "./types.js";
import type { WalkStream } from "./walk.js";
import { walkByPosition } from "./walk.js";

/** The stream key for evaluated operations whose scope no projection reads. */
const EVALUATED_ONLY = "evaluated";

/** A derived stream that joined the walk, remembered by projection name. */
type DerivedEntry = {
  name: string;
  query: StreamQuery;
};

/**
 * Whether any stream the model reads declares this operation's action type as
 * one that can change an evaluation.
 */
function isDecidingAction(
  operation: Operation,
  readSet: ReadStream[],
): boolean {
  return readSet.some((stream) =>
    stream.decidingActions.includes(operation.action.type),
  );
}

/**
 * Who an operation acts as. A replayed operation is evaluated as its own signer,
 * so an address-scoped policy does not deny its own author's history.
 */
function subjectOf(operation: Operation): AuthSubject {
  const signer = operation.action.context?.signer;
  return { address: signer?.user.address, key: signer?.app.key };
}

/**
 * The model as the walk reached this operation: each static projection's value
 * is its own scope's state, and each derived projection's value maps document
 * id to that document's state, holding only the streams this replica walked. A
 * derived stream it does not hold stays out of the map, which fails closed.
 */
function modelAt<M>(
  readSet: ReadStream[],
  derivedNames: string[],
  derived: DerivedEntry[],
  states: Map<string, PHDocument>,
): M {
  const model: Record<string, unknown> = {};

  for (const stream of readSet) {
    const document = states.get(streamKey(stream.query));
    if (document === undefined) {
      throw new Error(`No state walked for projection ${stream.name}`);
    }
    model[stream.name] = (document.state as Record<string, unknown>)[
      stream.query.scope
    ];
  }

  // Every derived projection is present even when nothing was walked for it,
  // so a decide never distinguishes "no streams" from "not yet built".
  for (const name of derivedNames) {
    model[name] = {};
  }

  for (const entry of derived) {
    const map = model[entry.name] as Record<string, unknown>;
    const document = states.get(streamKey(entry.query));
    if (document !== undefined) {
      map[entry.query.documentId] = (document.state as Record<string, unknown>)[
        entry.query.scope
      ];
    }
  }

  return model as M;
}

/**
 * Evaluates each operation at its own position and returns the refusals in an
 * array parallel to the operations, where undefined means allowed.
 *
 * A position is a timestamp, so an operation refused by a delete is one that
 * sorts after it, and the operations before it are left alone. That holds
 * whether the delete is already stored or is among the operations passed in.
 */
export async function evaluateByPosition<M>(
  model: (target: DecisionTarget) => DecisionModel<M>,
  target: DecisionTarget,
  subject: EvaluationSubject,
  stores: DecisionStores,
  signal?: AbortSignal,
): Promise<Array<string | undefined>> {
  const { scope, operations } = subject;
  const { writeCache, operationStore } = stores;

  const definition = model(target);
  const readSet = staticReadSet(definition);
  const derivedSet = derivedReadSet(definition);

  if (!definition.evaluatesScope(scope)) {
    return operations.map(() => undefined);
  }

  // Re-evaluation passes in operations that are already stored, so the reads
  // below exclude them and no operation is refused by its own stored copy.
  const evaluating = new Set(operations.map((operation) => operation.id));

  // One indexed query per read stream, narrowed to the actions that can change
  // an evaluation. A document holding none of them returns just below.
  const readStreams = await Promise.all(
    readSet.map(async (stream) => ({
      stream,
      operations: (
        await operationStore.getSince(
          stream.query.documentId,
          stream.query.scope,
          stream.query.branch,
          -1,
          { actionTypes: stream.decidingActions },
          undefined,
          signal,
        )
      ).results.filter((operation) => !evaluating.has(operation.id)),
    })),
  );

  const decidingOperations = operations.filter((operation) =>
    isDecidingAction(operation, readSet),
  );

  // Derived streams can only be named by static-stream operations, so an
  // empty static range has an empty derived read-set and this exit is safe.
  if (
    readStreams.every((read) => read.operations.length === 0) &&
    decidingOperations.length === 0
  ) {
    return operations.map(() => undefined);
  }

  if (readStreams.length === 0) {
    throw new Error(
      `Decision model for ${target.documentId} reads no stream whose query is known before it is built`,
    );
  }

  const writtenProjection = readSet.find(
    (stream) => stream.query.scope === scope,
  );

  const walked: WalkStream[] = [];
  const histories: StreamHistory[] = [];
  for (const read of readStreams) {
    const isWritten = read.stream === writtenProjection;

    // Walked in the stream they are written to, so a delete among them is
    // seen by the operations after it.
    const streamOperations = isWritten
      ? [...read.operations, ...operations]
      : read.operations;

    // Walked from before any of its operations. On the auth stream index 0 is the
    // genesis policy, which a bound of 0 would pre-apply without ever visiting.
    const before = await writeCache.getState(
      read.stream.query.documentId,
      read.stream.query.scope,
      read.stream.query.branch,
      -1,
      signal,
    );
    walked.push({
      streamKey: streamKey(read.stream.query),
      scope: read.stream.query.scope,
      document: before,
      operations: streamOperations,
      apply: read.stream.apply,
    });
    histories.push({
      name: read.stream.name,
      operations: streamOperations,
    });
  }

  if (writtenProjection === undefined) {
    // No projection reads this scope, so these take a position without
    // contributing state to any of them.
    walked.push({
      streamKey: EVALUATED_ONLY,
      scope,
      document: walked[0].document,
      operations,
      apply: (document) => document,
    });
  }

  // Derived streams join the walk from the union their range mentions. One
  // this replica does not hold stays out, which fails closed; one already
  // walked statically is not read twice.
  const derivedEntries: DerivedEntry[] = [];
  const walkedKeys = new Set(walked.map((stream) => stream.streamKey));
  for (const projection of derivedSet) {
    const queries = projection.queryOverHistory?.(histories) ?? [];
    for (const query of queries) {
      const key = streamKey(query);
      if (walkedKeys.has(key)) {
        continue;
      }

      let before: PHDocument;
      try {
        before = await writeCache.getState(
          query.documentId,
          query.scope,
          query.branch,
          -1,
          signal,
        );
      } catch (error) {
        if (error instanceof DocumentNotFoundError) {
          continue;
        }
        throw error;
      }

      const streamOperations = (
        await operationStore.getSince(
          query.documentId,
          query.scope,
          query.branch,
          -1,
          { actionTypes: projection.decidingActions },
          undefined,
          signal,
        )
      ).results.filter((operation) => !evaluating.has(operation.id));

      walkedKeys.add(key);
      walked.push({
        streamKey: key,
        scope: query.scope,
        document: before,
        operations: streamOperations,
        apply: projection.apply,
      });
      derivedEntries.push({ name: projection.name, query });
    }
  }

  const reasons = new Map<string, string | undefined>();

  // By hand, because for...of cannot send the verdict back into the generator.
  const walk = walkByPosition(walked);
  let step = walk.next(false);
  while (!step.done) {
    const position = step.value;
    if (!evaluating.has(position.operation.id)) {
      step = walk.next(false);
      continue;
    }

    const evaluation = definition.decide(
      modelAt<M>(
        readSet,
        derivedSet.map((projection) => projection.name),
        derivedEntries,
        position.states,
      ),
      subjectOf(position.operation),
      {
        verb: "execute",
        scope: position.operation.action.scope,
        operation: position.operation.action.type,
      },
      { scopeState: undefined },
    );

    const denied = evaluation.decision === "deny";
    reasons.set(position.operation.id, denied ? evaluation.reason : undefined);
    step = walk.next(denied);
  }

  return operations.map((operation) => reasons.get(operation.id));
}
