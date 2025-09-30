import { useSyncExternalStore } from "react";
import {
  dispatchSetModalEvent,
  getModalSnapshot,
  subscribeToModal,
} from "../events/modals.js";
import type { PHModal } from "../types/modals.js";

export function usePHModal() {
  return useSyncExternalStore(subscribeToModal, getModalSnapshot);
}

export function showPHModal(modal: PHModal) {
  dispatchSetModalEvent(modal);
}

export function closePHModal() {
  dispatchSetModalEvent(undefined);
}

export function showCreateDocumentModal(documentType: string) {
  dispatchSetModalEvent({ type: "createDocument", documentType });
}

export function showDeleteNodeModal(id: string) {
  dispatchSetModalEvent({ type: "deleteItem", id });
}
