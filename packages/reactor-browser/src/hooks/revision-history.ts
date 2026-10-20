import { setSearchParams } from "./navigation.js";
import { useSearchParams } from "./url-state.js";

/** The query param that opens the document's revision history: `?history`. */
export const REVISION_HISTORY_PARAM = "history";

/** The history page shown, from 1 (the newest operations): `?history&page=2`. */
export const REVISION_HISTORY_PAGE_PARAM = "page";

/** The page a `page` param names: a positive integer, else the first. */
export function parseRevisionHistoryPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Whether the URL opens the revision history. */
export function useRevisionHistoryVisible(): boolean {
  return useSearchParams()[REVISION_HISTORY_PARAM] !== undefined;
}

/** The revision history page the URL names, from 1. */
export function useRevisionHistoryPage(): number {
  return parseRevisionHistoryPage(
    useSearchParams()[REVISION_HISTORY_PAGE_PARAM],
  );
}

/** Shows the revision history: a new history entry, so Back closes it. */
export function showRevisionHistory() {
  setSearchParams((prev) => ({ ...prev, [REVISION_HISTORY_PARAM]: "" }));
}

/** Hides the revision history. */
export function hideRevisionHistory() {
  setSearchParams((prev) => ({
    ...prev,
    [REVISION_HISTORY_PARAM]: undefined,
    [REVISION_HISTORY_PAGE_PARAM]: undefined,
  }));
}

/** Opens history page `page`, from 1; Back returns to the page before. */
export function setRevisionHistoryPage(page: number) {
  setSearchParams((prev) => ({
    ...prev,
    [REVISION_HISTORY_PARAM]: "",
    [REVISION_HISTORY_PAGE_PARAM]: page > 1 ? String(page) : undefined,
  }));
}

/** Shows or hides the revision history. */
export function setRevisionHistoryVisible(visible: boolean | undefined) {
  if (visible) showRevisionHistory();
  else hideRevisionHistory();
}

/** @deprecated The revision history is a URL param now; there is no store value to watch. */
export function addRevisionHistoryVisibleEventHandler() {}
