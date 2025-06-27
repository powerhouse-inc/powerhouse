import { type PHDocument } from "document-model";
import { useAtomValue, useSetAtom } from "jotai";
import {
  documentsAtom,
  loadableDocumentsAtom,
  loadableSelectedDocumentAtom,
  unwrappedDocumentsAtom,
  unwrappedSelectedDocumentAtom,
} from "./atoms.js";
import { type Loadable } from "./types.js";

/** Returns a loadable of the documents for a reactor. */
export function useDocuments() {
  return useAtomValue(loadableDocumentsAtom);
}

/** Returns a resolved promise of the documents for a reactor. */
export function useUnwrappedDocuments() {
  return useAtomValue(unwrappedDocumentsAtom);
}

/** Refreshes the documents for a reactor. */
export function useRefreshDocuments() {
  return useSetAtom(documentsAtom);
}

/** Returns a loadable of the selected document. */
export function useSelectedDocument() {
  return useAtomValue(loadableSelectedDocumentAtom);
}

/** Returns a resolved promise of the selected document. */
export function useUnwrappedSelectedDocument() {
  return useAtomValue(unwrappedSelectedDocumentAtom);
}

/** Returns a loadable of a document for a reactor by id. */
export function useDocumentById(
  id: string | null | undefined,
): Loadable<PHDocument | undefined> {
  const documents = useDocuments();
  if (!id) return { state: "hasData", data: undefined };
  if (documents.state !== "hasData") return documents;
  const document = documents.data.find((d) => d.id === id);
  return { state: "hasData", data: document };
}

/** Returns a resolved promise of a document for a reactor by id. */
export function useUnwrappedDocumentById(
  id: string | null | undefined,
): PHDocument | undefined {
  const documents = useUnwrappedDocuments();
  if (!id) return undefined;
  return documents?.find((d) => d.id === id);
}
