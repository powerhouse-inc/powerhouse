import { actionReferences } from "@powerhousedao/shared/document-model";
import { throwIfAborted } from "../shared/utils.js";
import type { IOperationStore } from "./interfaces.js";

const PAGE = 500;

/**
 * The ids among `actionIds` that some stored action in the stream references.
 * A store without `findReferencing` is scanned row by row.
 */
export async function findReferencing(
  store: IOperationStore,
  documentId: string,
  scope: string,
  branch: string,
  actionIds: string[],
  signal?: AbortSignal,
): Promise<Set<string>> {
  if (store.findReferencing) {
    return store.findReferencing(documentId, scope, branch, actionIds, signal);
  }
  const wanted = new Set(actionIds);
  const found = new Set<string>();
  let cursor: string | undefined = wanted.size > 0 ? "0" : undefined;
  while (cursor !== undefined) {
    throwIfAborted(signal);
    const page = await store.getSince(
      documentId,
      scope,
      branch,
      -1,
      undefined,
      { cursor, limit: PAGE },
      signal,
    );
    for (const operation of page.results) {
      for (const id of actionReferences(operation.action)) {
        if (wanted.has(id)) found.add(id);
      }
    }
    cursor = page.nextCursor || undefined;
  }
  return found;
}
