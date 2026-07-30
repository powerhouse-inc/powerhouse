import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { applyDeleteDocumentAction } from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IOperationStore } from "../storage/interfaces.js";
import { staticReadSet } from "./build-decision-model.js";
import {
  documentDecisionModel,
  DOCUMENT_DELETED_REASON,
} from "./document-decision-model.js";
import { streamKey } from "./merged-order.js";
import type { ReadStream } from "./types.js";
import type { WalkStream } from "./walk.js";
import { walkByPosition } from "./walk.js";

type DocumentState = PHDocument["state"]["document"];

const INCOMING = "incoming";

/** Whether a read stream counts this action as one that changes a verdict. */
function canRefuseOthers(operation: Operation, readSet: ReadStream[]): boolean {
  return readSet.some((stream) =>
    stream.decidingActions.includes(operation.action.type),
  );
}

/**
 * Applies a deletion, and nothing else, because nothing else changes the
 * verdict. The document is copied because the shared handler assigns to `state`.
 */
function applyDeletion(document: PHDocument, operation: Operation): PHDocument {
  if (operation.action.type !== "DELETE_DOCUMENT") {
    return document;
  }

  return applyDeleteDocumentAction(
    { ...document, state: { ...document.state } },
    operation.action as never,
  );
}

/** The deleted one of these, or the first if none of them is deleted. */
function firstDeleted(
  candidates: Array<PHDocument | undefined>,
): DocumentState {
  for (const candidate of candidates) {
    if (candidate?.state.document.isDeleted) {
      return candidate.state.document;
    }
  }
  return candidates[0]!.state.document;
}

/**
 * This function determines which operations will be refused because of
 * deletes, returning reasons in a parallel array (undefined means the
 * operation is not refused).
 *
 * A deletion already in the stream refuses the operations timestamped after it
 * and leaves the earlier ones alone. A deletion arriving inside the batch does
 * the same to the rest of the batch.
 */
export async function deletionVerdictsByPosition(
  documentId: string,
  scope: string,
  branch: string,
  operations: Operation[],
  writeCache: IWriteCache,
  operationStore: IOperationStore,
  signal?: AbortSignal,
): Promise<Array<string | undefined>> {
  const definition = documentDecisionModel({ documentId, branch });
  const readSet = staticReadSet(definition);

  if (!definition.judgesScope(scope)) {
    return operations.map(() => undefined);
  }

  // Cheap and indexed. A document that has never been deleted -- nearly all of
  // them -- costs one query per read stream and stops here.
  const stored = await Promise.all(
    readSet.map(async (stream) => ({
      stream,
      operations: (
        await operationStore.getSince(
          stream.query.documentId,
          stream.query.scope,
          stream.query.branch,
          0,
          { actionTypes: stream.decidingActions },
          undefined,
          signal,
        )
      ).results,
    })),
  );

  const arriving = operations.filter((operation) =>
    canRefuseOthers(operation, readSet),
  );

  if (
    stored.every((read) => read.operations.length === 0) &&
    arriving.length === 0
  ) {
    return operations.map(() => undefined);
  }

  const walked: WalkStream[] = [];
  for (const read of stored) {
    // We must walk each read stream, but we need the initial state.
    const before = await writeCache.getState(
      read.stream.query.documentId,
      read.stream.query.scope,
      read.stream.query.branch,
      0,
      signal,
    );
    walked.push({
      streamKey: streamKey(read.stream.query),
      document: before,
      operations: read.operations,
    });
  }

  // The operations being judged sit in their own stream, so a deletion arriving
  // among them counts alongside one already stored.
  walked.push({
    streamKey: INCOMING,
    document: walked[0].document,
    operations,
  });

  const reasons = new Map<string, string | undefined>();

  for (const step of walkByPosition(walked, applyDeletion)) {
    if (step.streamKey !== INCOMING) {
      continue;
    }

    const document = firstDeleted([...step.states.values()]);

    const decision = definition.decide(
      { document },
      { address: undefined, key: undefined },
      { verb: "execute", scope, operation: step.operation.action.type },
      { scopeState: undefined },
    );

    reasons.set(
      step.operation.id,
      decision === "deny" ? DOCUMENT_DELETED_REASON : undefined,
    );
  }

  return operations.map((operation) => reasons.get(operation.id));
}
