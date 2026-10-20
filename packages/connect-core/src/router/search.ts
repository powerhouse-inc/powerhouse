import {
  FEATURE_FLAG_PARAM_PREFIX,
  GLOBAL_SEARCH_PARAMS,
  parseRevisionHistoryPage,
  REVISION_HISTORY_PAGE_PARAM,
  REVISION_HISTORY_PARAM,
  searchParamsToString,
} from "@powerhousedao/reactor-browser";
import type { SearchMiddleware } from "@tanstack/react-router";
import { retainSearchParams } from "@tanstack/react-router";

// Shared with reactor-browser's fallback navigation.
export { FEATURE_FLAG_PARAM_PREFIX, GLOBAL_SEARCH_PARAMS };

/** Connect's query params: plain strings, as in the URL. */
export type ConnectSearch = Record<string, string | undefined>;

const retainFeatureFlags: SearchMiddleware<ConnectSearch> = ({
  search,
  next,
}) => {
  const result = { ...next(search) };
  for (const [key, value] of Object.entries(search)) {
    if (key.startsWith(FEATURE_FLAG_PARAM_PREFIX) && !(key in result)) {
      result[key] = value;
    }
  }
  return result;
};

/** The root route's middlewares; they apply to every navigation and redirect. */
export const connectSearchMiddlewares: SearchMiddleware<ConnectSearch>[] = [
  retainSearchParams<ConnectSearch>([...GLOBAL_SEARCH_PARAMS]),
  retainFeatureFlags,
];

/** Lets every param through; routes add none of their own. */
export function validateConnectSearch(
  search: Record<string, unknown>,
): ConnectSearch {
  return search as ConnectSearch;
}

/** Parses a query string into plain string values, unlike the JSON default. */
export function parseConnectSearch(searchStr: string): ConnectSearch {
  return Object.fromEntries(new URLSearchParams(searchStr));
}

/** Writes plain `key=value` pairs, so other readers of the URL see strings. */
export function stringifyConnectSearch(search: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const searchStr = searchParamsToString(params);
  return searchStr ? `?${searchStr}` : "";
}

/** The drive route's params: `?history` opens the document's revision history,
 * and `page` (a positive integer; 1 is dropped) pages it. */
export function validateDriveSearch(
  search: Record<string, unknown>,
): ConnectSearch {
  const result = { ...search } as ConnectSearch;
  // Without `history`, a `page` is the document's own, e.g. a drive app's.
  if (result[REVISION_HISTORY_PARAM] === undefined) return result;
  result[REVISION_HISTORY_PARAM] = "";
  const page = parseRevisionHistoryPage(result[REVISION_HISTORY_PAGE_PARAM]);
  if (page > 1) result[REVISION_HISTORY_PAGE_PARAM] = String(page);
  // Undefined, not deleted: a route's search is merged over its parent's.
  else result[REVISION_HISTORY_PAGE_PARAM] = undefined;
  return result;
}

/** The defined values of `search`, for callers that take plain records. */
export function definedSearch(search: object): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") record[key] = value;
    else if (value !== undefined && value !== null) {
      record[key] = JSON.stringify(value);
    }
  }
  return record;
}
