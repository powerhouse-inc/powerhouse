import type { OperationWithContext } from "../document-model/index.js";
import { PURGE_DOCUMENT } from "../document-model/purge.js";

/** The id a DELETE_DOCUMENT or PURGE_DOCUMENT removes; undefined otherwise. */
export function deletedDocumentId(
  op: OperationWithContext,
): string | undefined {
  const { type, input } = op.operation.action;
  if (type !== "DELETE_DOCUMENT" && type !== PURGE_DOCUMENT) return undefined;
  const documentId = (input as { documentId?: unknown } | undefined)
    ?.documentId;
  return typeof documentId === "string" ? documentId : op.context.documentId;
}
