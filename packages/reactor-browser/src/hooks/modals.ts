import type { PHModal } from "@powerhousedao/reactor-browser";
import type { Node } from "@powerhousedao/shared/document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { hasHostNavigation, openTarget } from "./navigation.js";

const modalEventFunctions = makePHEventFunctions("modal");

/** Returns the current modal */
export const usePHModal = modalEventFunctions.useValue;

/** Sets the current modal */
export const setPHModal = modalEventFunctions.setValue;

/** Adds an event handler for the modal */
export const addModalEventHandler = modalEventFunctions.addEventHandler;

/** Shows a modal; with an app-shell navigation, "settings" opens the settings page. */
export function showPHModal(modal: PHModal) {
  if (modal.type === "settings" && hasHostNavigation()) {
    openTarget({ settings: true });
    return;
  }
  setPHModal(modal);
}

/** Closes the current modal */
export function closePHModal() {
  setPHModal(undefined);
}

/** Shows the create document modal */
export function showCreateDocumentModal(
  documentType: string,
  documentModelVersion?: number,
) {
  setPHModal({
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
