import { type PHDocument } from "document-model";
import { useAtomValue } from "jotai";
import {
  loadableDocumentsAtom,
  loadableSelectedDocumentAtom,
  unwrappedDocumentsAtom,
  unwrappedSelectedDocumentAtom,
} from "../internal/atoms.js";
import { type Loadable } from "../internal/types.js";

/** Returns the documents for the selected drive. */
export function useDocuments() {
  return useAtomValue(unwrappedDocumentsAtom);
}

/** Returns a loadable of the documents for the selected drive. */
export function useLoadableDocuments() {
  return useAtomValue(loadableDocumentsAtom);
}

/** Returns the selected document. */
export function useSelectedDocument<
  TDocument extends PHDocument = PHDocument,
>() {
  return useAtomValue(unwrappedSelectedDocumentAtom) as TDocument | undefined;
}

/** Returns a loadable of the selected document. */
export function useLoadableSelectedDocument<
  TDocument extends PHDocument = PHDocument,
>() {
  return useAtomValue(loadableSelectedDocumentAtom) as Loadable<
    TDocument | undefined
  >;
}

/** Returns the document type of a document by id. */
export function useDocumentTypeById(id: string | null | undefined) {
  const document = useDocumentById(id);
  return document?.header.documentType;
}

/** Returns the document type of the selected document. */
export function useSelectedDocumentType() {
  const selectedDocument = useSelectedDocument();
  return selectedDocument?.header.documentType;
}

/** Returns a document by id. */
export function useDocumentById<TDocument extends PHDocument = PHDocument>(
  id: string | null | undefined,
): TDocument | undefined {
  const documents = useDocuments();
  if (!id) return undefined;
  return documents?.find((d) => d.header.id === id) as TDocument | undefined;
}

/** Returns a loadable of a document by id. */
export function useLoadableDocumentById<
  TDocument extends PHDocument = PHDocument,
>(id: string | null | undefined): Loadable<TDocument | undefined> {
  const loadableDocuments = useLoadableDocuments();
  if (loadableDocuments.state !== "hasData") return loadableDocuments;

  if (!id) return { state: "hasData", data: undefined };

  const document = loadableDocuments.data?.find((d) => d.header.id === id);
  return { state: "hasData", data: document } as Loadable<
    TDocument | undefined
  >;
}
