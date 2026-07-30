import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  isDenied,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { mergeByPosition } from "./merged-order.js";

/** One read-set stream, with the state it holds before any of its operations. */
export type WalkStream = {
  streamKey: string;
  document: PHDocument;
  apply: ApplyOperation;
  /** The stream's stored operations. Order and skips are resolved internally. */
  operations: Operation[];
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
 * Visits every operation in the read-set once, in the order their positions
 * fall, and hands back the state each stream held just before it. That state is
 * what a decision at that operation reads: everything ahead of it has been
 * applied and it has not.
 *
 * Skips are resolved first (i.e. this is performed on a garbage collected
 * stream), which means we can do a single forward pass.
 *
 * A denied operation is visited but not applied.
 */
export function* walkByPosition(
  streams: WalkStream[],
): Generator<WalkPosition> {
  const merged = mergeByPosition(
    streams.map((stream) => ({
      streamKey: stream.streamKey,
      operations: garbageCollect(sortOperations([...stream.operations])),
    })),
  );

  const states = new Map(
    streams.map((stream) => [stream.streamKey, stream.document]),
  );

  for (const { streamKey, operation } of merged) {
    yield { streamKey, operation, states: new Map(states) };

    if (isDenied(operation)) {
      continue;
    }

    const stream = streams.find(
      (candidate) => candidate.streamKey === streamKey,
    );
    const before = states.get(streamKey);
    if (before === undefined || stream === undefined) {
      throw new Error(`No state for stream ${streamKey}`);
    }

    states.set(streamKey, stream.apply(before, operation));
  }
}
