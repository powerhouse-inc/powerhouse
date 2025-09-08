import { type PHDocument } from "document-model";
import { type PagedResults } from "./shared/types.js";

/**
 * Filters paged results by parent ID
 */
export function filterByParentId(
  results: PagedResults<PHDocument>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parentId: string,
): PagedResults<PHDocument> {
  // TODO: Implement filterByParentId
  return results;
}

/**
 * Filters paged results by document type
 */
export function filterByType(
  results: PagedResults<PHDocument>,
  type: string,
): PagedResults<PHDocument> {
  // Filter documents by their document type from the header
  const filteredDocuments = results.results.filter(
    (document) => document.header.documentType === type,
  );

  // Create new paged results with filtered documents
  // Note: This maintains the same paging structure but with filtered results
  return {
    results: filteredDocuments,
    options: results.options,
    nextCursor: results.nextCursor,
    next: results.next
      ? async () => {
          // If there's a next function, apply the same filter to the next page
          const nextResults = await results.next!();
          return filterByType(nextResults, type);
        }
      : undefined,
  };
}
