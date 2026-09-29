import type { Action } from "./actions.js";
import type { Operation, OperationWithContext } from "./operations.js";
import { DOCUMENT_PURGE_PROTOCOL } from "./peer-agreement.js";
import type { PurgeDocumentAction, PurgeDocumentActionInput } from "./types.js";
import { deriveOperationId, generateId } from "./utils.js";

export const PURGE_DOCUMENT = "PURGE_DOCUMENT";

export type PurgeMarkerOperation = Operation & { action: PurgeDocumentAction };

type ActionLike = Pick<Action, "type">;

export function isPurgeMarker(value: Action): value is PurgeDocumentAction;
export function isPurgeMarker(value: Operation): value is PurgeMarkerOperation;
export function isPurgeMarker(
  value: OperationWithContext,
): value is OperationWithContext & { operation: PurgeMarkerOperation };
export function isPurgeMarker(
  value: ActionLike | { action?: ActionLike } | { operation: Operation },
): boolean;
export function isPurgeMarker(
  value: ActionLike | { action?: ActionLike } | { operation: Operation },
): boolean {
  const action =
    "operation" in value
      ? value.operation.action
      : "action" in value
        ? value.action
        : (value as ActionLike);
  return action?.type === PURGE_DOCUMENT;
}

/** An unsigned marker; `purgedAtUtcIso` is the action's own timestamp. */
export function purgeDocumentAction(
  input: Omit<PurgeDocumentActionInput, "purgedAtUtcIso">,
  options: { id?: string; timestampUtcMs?: string } = {},
): PurgeDocumentAction {
  const timestampUtcMs = options.timestampUtcMs ?? new Date().toISOString();
  return {
    id: options.id ?? generateId(),
    type: PURGE_DOCUMENT,
    scope: "document",
    timestampUtcMs,
    input: {
      documentId: input.documentId,
      documentType: input.documentType,
      purgedAtUtcIso: timestampUtcMs,
      requestId: input.requestId,
    },
  };
}

/** The sole row of a purged stream: document/main, index 0, skip 0, hash "". */
export function purgeMarkerOperation(
  action: PurgeDocumentAction,
): PurgeMarkerOperation {
  return {
    id: deriveOperationId(
      action.input.documentId,
      "document",
      "main",
      action.id,
    ),
    index: 0,
    skip: 0,
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    action,
  };
}

/** Protocol versions of a purged id; derived, never stored. */
export function purgedProtocolVersions(): { [protocol: string]: number } {
  return { [DOCUMENT_PURGE_PROTOCOL]: 1 };
}
