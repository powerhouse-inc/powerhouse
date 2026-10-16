import type {
  PHNavigation,
  SetSearchParams,
} from "@powerhousedao/reactor-browser";
import { getNavigationOf } from "./navigation.js";
import { usePHStore } from "./ph-store.js";

/** The nearest store's navigation, else the bound store's, else the browser's.
 * Hosts set it once, so hook order holds. */
export function usePHNavigation(): PHNavigation {
  return getNavigationOf(usePHStore());
}

/** The current query params. */
export function useSearchParams(): Record<string, string> {
  return usePHNavigation().useSearchParams();
}

/** Sets query params: an object merges into them, a function returns them all. */
export function useSetSearchParams(): SetSearchParams {
  return usePHNavigation().useSetSearchParams();
}
