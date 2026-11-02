import type {
  BaseReducerCapabilities,
  IdOrder,
  Operation,
  PHDocument,
  ReducerFor,
} from "@powerhousedao/shared/document-model";
import {
  deriveScope,
  derivesByRule,
  garbageCollect,
  idOrderFor,
  isDenied,
  optionalBaseReducerCapabilities,
  positionalOperations,
  reduceOne,
  retractionRewrites,
  retractionTarget,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { comparePositions, mergeByPosition } from "./merged-order.js";

/**
 * A single forward pass is only correct while a stream's effective operations
 * are ordered.
 */
function assertPositionOrder(
  streamKey: string,
  scope: string,
  operations: Operation[],
  compareIds: IdOrder,
): void {
  for (let i = 1; i < operations.length; i++) {
    const previous = operations[i - 1];
    const current = operations[i];
    // The same scope on both sides, so only the intra-stream rules apply.
    if (
      comparePositions(
        { streamKey, scope, operation: previous },
        { streamKey, scope, operation: current },
        compareIds,
      ) > 0
    ) {
      throw new Error(
        `Stream ${streamKey} is out of position order: index ${previous.index} at ${previous.timestampUtcMs} precedes index ${current.index} at ${current.timestampUtcMs}`,
      );
    }
  }
}

/** One read-set stream, with the state it holds before any of its operations. */
export type WalkStream = {
  streamKey: string;
  /** Decides a cross-stream timestamp tie, which an auth operation wins. */
  scope: string;
  document: PHDocument;
  /**
   * The base-reducer capabilities `document` runs under. Unset, they are
   * read from its header, which knows no version this build does not.
   */
  caps?: BaseReducerCapabilities;
  apply: ApplyOperation;
  /** The stream's stored operations. Order and skips are resolved internally. */
  operations: Operation[];
  /**
   * Base-reducer 3: the stream's state reducers. With them a rule scope
   * derives by the rule instead of through `apply`.
   */
  reducerFor?: ReducerFor;
};

/** Marks a row this pass refused, so a derivation leaves it out. */
const DENIED_IN_WALK = "denied in walk";

function capabilitiesOf(
  stream: WalkStream,
): BaseReducerCapabilities | undefined {
  return stream.caps ?? optionalBaseReducerCapabilities(stream.document.header);
}

/** A stream carrying rule reducers whose scope the rule derives. */
function walksByRule(stream: WalkStream): boolean {
  return (
    stream.reducerFor !== undefined &&
    derivesByRule(capabilitiesOf(stream), stream.scope)
  );
}

/** A rule stream's walked rows, and the ids the walked RETRACTs name. */
type RuleState = {
  reducerFor: ReducerFor;
  prefix: Operation[];
  named: Set<string>;
};

/** Applies one operation to the stream it belongs to. */
export type ApplyOperation = (
  document: PHDocument,
  operation: Operation,
) => PHDocument;

/** An operation, and every stream as it stood immediately before it. */
export type WalkPosition = {
  streamKey: string;
  operation: Operation;
  states: Map<string, PHDocument>;
};

/**
 * The evaluated document's id order, so a v2 document's ties never depend on
 * whether a v3 stream joined its read set.
 */
export function walkIdOrder(
  streams: readonly WalkStream[],
  documentId: string,
): IdOrder {
  const stream =
    streams.find((stream) => stream.document.header.id === documentId) ??
    streams.at(0);
  return idOrderFor(stream && capabilitiesOf(stream)?.tieOrder);
}

/**
 * Visits every operation in the read-set once, in the order their positions
 * fall, and hands back the state each stream held just before it. That state is
 * what a decision at that operation reads.
 *
 * Skips are resolved first (i.e. this is performed on a garbage collected
 * stream), which means we can do a single forward pass.
 *
 * An operation that contributes no state, whether denied or holding a reducer
 * error, is visited but not applied (this matches the write cache's rebuild).
 *
 * On base-reducer 3 a rule scope ignores stored errors, and a RETRACT or a row
 * an earlier RETRACT names re-derives the stream from the rows walked so far.
 *
 * `compareIds` breaks a cross-stream tie; see {@link walkIdOrder}.
 *
 * The consumer sends back whether it refused the operation it was handed: a
 * refusal this pass produced must suppress it the same way a stored one does.
 */
export function* walkByPosition(
  streams: WalkStream[],
  compareIds: IdOrder,
): Generator<WalkPosition, void, boolean> {
  const rules = new Map<string, RuleState>();
  const merged = mergeByPosition(
    streams.map((stream) => {
      let operations: Operation[];
      if (walksByRule(stream)) {
        operations = positionalOperations(stream.operations);
        rules.set(stream.streamKey, {
          reducerFor: stream.reducerFor!,
          prefix: [],
          named: new Set(),
        });
      } else {
        operations = garbageCollect(sortOperations([...stream.operations]));
      }
      assertPositionOrder(
        stream.streamKey,
        stream.scope,
        operations,
        compareIds,
      );
      return {
        streamKey: stream.streamKey,
        scope: stream.scope,
        operations,
      };
    }),
    compareIds,
  );

  const byKey = new Map(streams.map((stream) => [stream.streamKey, stream]));
  const states = new Map(
    streams.map((stream) => [stream.streamKey, stream.document]),
  );

  for (const { streamKey, operation } of merged) {
    const deniedNow = yield { streamKey, operation, states: new Map(states) };

    const rule = rules.get(streamKey);
    if (rule !== undefined) {
      const denied = deniedNow || isDenied(operation);
      rule.prefix.push(
        denied && !isDenied(operation)
          ? { ...operation, deniedReason: DENIED_IN_WALK }
          : operation,
      );
      const target = retractionTarget(operation);
      if (target !== undefined) {
        rule.named.add(target);
      }
      if (!denied) {
        states.set(streamKey, applyByRule(byKey, states, streamKey, rule));
      }
      continue;
    }

    if (deniedNow || operation.error !== undefined || isDenied(operation)) {
      continue;
    }

    const stream = byKey.get(streamKey);
    const before = states.get(streamKey);
    if (before === undefined || stream === undefined) {
      throw new Error(`No state for stream ${streamKey}`);
    }

    states.set(streamKey, stream.apply(before, operation));
  }
}

/**
 * Applies the last walked row of a rule stream. A RETRACT, or a row an earlier
 * RETRACT names, re-derives from the stream's starting state; a row that
 * throws applies nothing.
 */
function applyByRule(
  byKey: Map<string, WalkStream>,
  states: Map<string, PHDocument>,
  streamKey: string,
  rule: RuleState,
): PHDocument {
  const stream = byKey.get(streamKey);
  const before = states.get(streamKey);
  if (before === undefined || stream === undefined) {
    throw new Error(`No state for stream ${streamKey}`);
  }

  // The prefix is positional already, so a rewind never needs a derive here.
  const operation = rule.prefix.at(-1)!;
  if (retractionRewrites(operation, (id) => rule.named.has(id))) {
    return deriveScope(
      stream.document,
      rule.prefix,
      rule.reducerFor,
      stream.scope,
    ).document;
  }

  try {
    return reduceOne(before, operation, rule.reducerFor);
  } catch {
    return before;
  }
}
