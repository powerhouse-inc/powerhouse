import type { PHModal } from "../types/modals.js";
import type { SetModalEvent } from "./types.js";

export function dispatchSetModalEvent(modal: PHModal | undefined) {
  const event = new CustomEvent("ph:setModal", {
    detail: { modal },
  });
  window.dispatchEvent(event);
}

export function dispatchModalUpdatedEvent() {
  const event = new CustomEvent("ph:modalUpdated");
  window.dispatchEvent(event);
}

export function handleSetModalEvent(event: SetModalEvent) {
  const modal = event.detail.modal;
  window.phModal = modal;
  dispatchModalUpdatedEvent();
}

export function addModalEventHandler() {
  window.addEventListener("ph:setModal", handleSetModalEvent);
}

export function subscribeToModal(onStoreChange: () => void) {
  window.addEventListener("ph:modalUpdated", onStoreChange);
  return () => {
    window.removeEventListener("ph:modalUpdated", onStoreChange);
  };
}

export function getModalSnapshot() {
  return window.phModal;
}
