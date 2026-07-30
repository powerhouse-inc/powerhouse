import type {
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { applyDeleteDocumentAction } from "@powerhousedao/shared/document-model";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IOperationStore } from "../storage/interfaces.js";
import {
  documentDecisionModel,
  DOCUMENT_DELETED_REASON,
} from "./document-decision-model.js";
import { walkByPosition } from "./walk.js";

type DocumentState = PHDocument["state"]["document"];

const DOCUMENT_SCOPE = "document";
const EXISTING = "existing";
const INCOMING = "incoming";

/**
 * We filter on these action types, as they are the only ones that can
 * currently affect decision making.
 */
const REFUSING_ACTION_TYPES = ["DELETE_DOCUMENT"];

/** Whether this operation is one that can cause others to be refused. */
function canRefuseOthers(operation: Operation): boolean {
  return REFUSING_ACTION_TYPES.includes(operation.action.type);
}

/**
 * Applies a deletion, and nothing else, because nothing else changes the
 * verdict. The document is copied because the shared handler assigns to `state`.
 */
function applyDeletion(document: PHDocument, operation: Operation): PHDocument {
  if (!canRefuseOthers(operation)) {
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
  // Cheap and indexed. A document that has never been deleted -- nearly all of
  // them -- costs this one query and stops here.
  const existingDeletions = (
    await operationStore.getSince(
      documentId,
      DOCUMENT_SCOPE,
      branch,
      0,
      { actionTypes: REFUSING_ACTION_TYPES },
      undefined,
      signal,
    )
  ).results;

  const arrivingDeletions = operations.filter(canRefuseOthers);

  if (existingDeletions.length === 0 && arrivingDeletions.length === 0) {
    return operations.map(() => undefined);
  }

  const definition = documentDecisionModel({ documentId, branch });

  // We must walk the document scope, but we need the initial state.
  const before = await writeCache.getState(
    documentId,
    DOCUMENT_SCOPE,
    branch,
    0,
    signal,
  );

  const reasons = new Map<string, string | undefined>();

  for (const step of walkByPosition(
    [
      { streamKey: EXISTING, document: before, operations: existingDeletions },
      { streamKey: INCOMING, document: before, operations },
    ],
    applyDeletion,
  )) {
    if (step.streamKey !== INCOMING) {
      continue;
    }

    // A deletion refuses this operation whether it was already in the stream or
    // arrived earlier in the same batch, so both are consulted.
    const document = firstDeleted([
      step.states.get(EXISTING),
      step.states.get(INCOMING),
    ]);

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
