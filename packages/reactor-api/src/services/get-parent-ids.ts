import type { IReactorReadClient } from "@powerhousedao/reactor";
import type { GetParentIdsFn } from "./document-permission.service.js";

/**
 * The canonical parent-document resolver used for permission inheritance:
 * a document's parents are the sources of its incoming "child"
 * relationships. Lookup failures resolve to "no parents" so a relationship
 * store outage degrades to no inherited permissions rather than an error.
 * Reads through the read half: the indexer it asks is post-commit, as it was.
 */
export function createGetParentIdsFn(
  read: Pick<IReactorReadClient, "getIncomingRelationships">,
): GetParentIdsFn {
  return async (documentId: string): Promise<string[]> => {
    try {
      const result = await read.getIncomingRelationships(documentId, "child");
      return result.results.map((doc) => doc.header.id);
    } catch {
      return [];
    }
  };
}
