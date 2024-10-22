import { Store } from "@tanstack/store";
import { Document } from "document-model/document";
export const documentModelStore = new Store<Document | undefined>(undefined);

export function syncWithDocument(document: Document) {
  documentModelStore.setState(() => document);
}
