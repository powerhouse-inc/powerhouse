import type { PHModal } from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import type { Node } from "document-drive";

const modalEventFunctions = makePHEventFunctions("modal");

/** Returns the current modal */
export const usePHModal = modalEventFunctions.useValue;

/** Sets the current modal */
export const setPHModal = modalEventFunctions.setValue;

/** Adds an event handler for the modal */
export const addModalEventHandler = modalEventFunctions.addEventHandler;

/** Shows a modal */
export function showPHModal(modal: PHModal) {
  setPHModal(modal);
}

/** Closes the current modal */
export function closePHModal() {
  setPHModal(undefined);
}

/** Shows the create document modal */
export function showCreateDocumentModal(documentType: string) {
  setPHModal({ type: "createDocument", documentType });
}

/** Shows the delete node modal */
export function showDeleteNodeModal(nodeOrId: Node | string) {
  const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
  setPHModal({ type: "deleteItem", id });
}
