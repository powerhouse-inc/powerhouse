import type { PHModal, PHSearchUpdate } from "@powerhousedao/reactor-browser";
import type { Node } from "@powerhousedao/shared/document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import {
  getPHNavigation,
  hasHostNavigation,
  openTarget,
  recordToSearch,
  searchToRecord,
} from "./navigation.js";

const modalEventFunctions = makePHEventFunctions("modal");

/** Returns the current modal */
export const usePHModal = modalEventFunctions.useValue;

/** Sets the current modal */
export const setPHModal = modalEventFunctions.setValue;

/** Adds an event handler for the modal */
export const addModalEventHandler = modalEventFunctions.addEventHandler;

/** The query param that names a routed modal. */
export const MODAL_SEARCH_PARAM = "modal";

type ModalOf<T extends PHModal["type"]> = Extract<PHModal, { type: T }>;
type ModalRoute<T extends PHModal["type"]> = {
  /** Its `?modal=` value. */
  id: string;
  /** Its fields as query params, and back. */
  toSearch?: (modal: ModalOf<T>) => Record<string, string>;
  fromSearch?: (search: Record<string, string>) => Omit<ModalOf<T>, "type">;
};

// Modals a link can open; they replace the current entry, so Back leaves the
// page rather than closing them. Confirmations stay in the store.
const MODAL_ROUTES: { [T in PHModal["type"]]?: ModalRoute<T> } = {
  createDocument: {
    id: "create-document",
    toSearch: ({ documentType, documentModelVersion }) => ({
      documentType,
      ...(documentModelVersion !== undefined && {
        documentModelVersion: String(documentModelVersion),
      }),
    }),
    fromSearch: (search) => ({
      documentType: search.documentType ?? "",
      ...(search.documentModelVersion && {
        documentModelVersion: Number(search.documentModelVersion),
      }),
    }),
  },
  login: { id: "login" },
  addDrive: { id: "add-drive" },
  driveSettings: {
    id: "drive-settings",
    toSearch: ({ driveId }) => ({ driveId }),
    fromSearch: (search) => ({ driveId: search.driveId ?? "" }),
  },
  debugSettings: { id: "debug-settings" },
  inspector: { id: "inspector" },
  disclaimer: { id: "disclaimer" },
  cookiesPolicy: { id: "cookies-policy" },
};

const routeOf = (type: PHModal["type"]) =>
  MODAL_ROUTES[type] as ModalRoute<PHModal["type"]> | undefined;

/** Whether `modal` lives in the URL rather than the store. */
export function isRoutedModal(modal: PHModal | undefined) {
  return !!modal && !!routeOf(modal.type);
}

/** The query params that open `modal`; undefined for one the store holds. */
export function modalSearch(
  modal: PHModal,
): Record<string, string> | undefined {
  const route = routeOf(modal.type);
  if (!route) return undefined;
  return { [MODAL_SEARCH_PARAM]: route.id, ...route.toSearch?.(modal) };
}

/** The routed modal `search` opens, if any. */
export function modalFromSearch(
  search: Record<string, unknown>,
): PHModal | undefined {
  const id = search[MODAL_SEARCH_PARAM];
  if (typeof id !== "string") return undefined;
  const strings = Object.fromEntries(
    Object.entries(search).map(([key, value]) => [key, String(value)]),
  );
  for (const [type, route] of Object.entries(MODAL_ROUTES)) {
    if (route.id !== id) continue;
    return { type, ...route.fromSearch?.(strings) } as PHModal;
  }
  return undefined;
}

/** `search` without a routed modal's params. */
export function withoutModalSearch(
  search: Record<string, string>,
): PHSearchUpdate {
  const modal = modalFromSearch(search);
  const own = modal ? Object.keys(modalSearch(modal) ?? {}) : [];
  return Object.fromEntries(
    Object.entries(search).filter(([key]) => !own.includes(key)),
  );
}

/** Shows a modal. With a host navigation, a routed one opens in the URL, in
 * place of the current entry, and "settings" opens the settings page. */
export function showPHModal(modal: PHModal) {
  if (modal.type === "settings" && hasHostNavigation()) {
    openTarget({ settings: true });
    return;
  }
  const search = modalSearch(modal);
  if (search && hasHostNavigation()) {
    getPHNavigation().setSearch(
      (prev) => ({ ...withoutModalSearch(prev), ...search }),
      { replace: true },
    );
    return;
  }
  setPHModal(modal);
}

/** Closes the current modal; a routed one leaves the URL in place of the entry. */
export function closePHModal() {
  if (hasHostNavigation()) {
    const navigation = getPHNavigation();
    if (modalFromSearch(searchToRecord(navigation.location().search))) {
      navigation.setSearch((prev) => withoutModalSearch(prev), {
        replace: true,
      });
      return;
    }
  }
  setPHModal(undefined);
}

/** The href that opens `modal` over the current page. */
export function modalHref(modal: PHModal) {
  const { pathname, search } = getPHNavigation().location();
  const next = {
    ...(withoutModalSearch(searchToRecord(search)) as Record<string, string>),
    ...modalSearch(modal),
  };
  return `${pathname}${recordToSearch(next)}`;
}

/** Shows the create document modal */
export function showCreateDocumentModal(
  documentType: string,
  documentModelVersion?: number,
) {
  showPHModal({
    type: "createDocument",
    documentType,
    ...(documentModelVersion !== undefined && { documentModelVersion }),
  });
}

/** Shows the delete node modal */
export function showDeleteNodeModal(nodeOrId: Node | string) {
  const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
  setPHModal({ type: "deleteItem", id });
}
