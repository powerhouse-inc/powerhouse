import { makePHEventFunctions } from "../events/make-ph-event-functions.js";
import type { PHModal } from "../types/modals.js";

export const {
  useValue: usePHModal,
  setValue: setPHModal,
  addEventHandler: addModalEventHandler,
} = makePHEventFunctions<PHModal>("phModal");

export function showPHModal(modal: PHModal) {
  setPHModal(modal);
}

export function closePHModal() {
  setPHModal(undefined);
}

export function showCreateDocumentModal(documentType: string) {
  setPHModal({ type: "createDocument", documentType });
}

export function showDeleteNodeModal(id: string) {
  setPHModal({ type: "deleteItem", id });
}
