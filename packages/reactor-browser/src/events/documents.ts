import { type PHDocument } from "document-model";
import { type SetDocumentsEvent } from "./types.js";

export function dispatchSetDocumentsEvent(documents: PHDocument[] | undefined) {
  const event = new CustomEvent("ph:setDocuments", {
    detail: { documents },
  });
  window.dispatchEvent(event);
}
export function dispatchDocumentsUpdatedEvent() {
  const event = new CustomEvent("ph:documentsUpdated");
  window.dispatchEvent(event);
}
export function handleSetDocumentsEvent(event: SetDocumentsEvent) {
  const documents = event.detail.documents;
  window.phDocuments = documents;
  dispatchDocumentsUpdatedEvent();
}

export function addDocumentsEventHandler() {
  window.addEventListener("ph:setDocuments", handleSetDocumentsEvent);
}
