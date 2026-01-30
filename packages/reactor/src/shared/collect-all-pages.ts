import type { PagedResults } from "./types.js";

/**
 * Collects all results from a paged result set by following the next() function
 * until all pages have been fetched.
 */
export async function collectAllPages<T>(
  firstPage: PagedResults<T>,
  signal?: AbortSignal,
): Promise<T[]> {
  const allResults: T[] = [...firstPage.results];
  let currentPage = firstPage;

  while (currentPage.next) {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
    currentPage = await currentPage.next();
    allResults.push(...currentPage.results);
  }

  return allResults;
}
