import { logger } from "document-drive";
import { type PHDocument } from "document-model";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import {
  documentsAtom,
  loadableDocumentsAtom,
  loadableSelectedDocumentAtom,
  unwrappedDocumentsAtom,
  unwrappedSelectedDocumentAtom,
} from "./atoms.js";
import { useSelectedDriveId } from "./drives.js";
import { type Loadable } from "./types.js";

/** Returns a loadable of the documents for a reactor. */
export function useDocuments() {
  return useAtomValue(loadableDocumentsAtom);
}

/** Returns a resolved promise of the documents for a reactor. */
export function useUnwrappedDocuments() {
  return useAtomValue(unwrappedDocumentsAtom);
}

/** Sets the documents for a reactor. */
export function useSetDocuments() {
  return useSetAtom(documentsAtom);
}

/** Refreshes the documents for a reactor. */
export function useRefreshDocuments() {
  const selectedDriveId = useSelectedDriveId();
  const setDocuments = useSetDocuments();

  return useCallback(() => {
    setDocuments(selectedDriveId).catch((error: unknown) =>
      logger.error(error),
    );
  }, [setDocuments, selectedDriveId]);
}

/** Returns a loadable of the selected document. */
export function useSelectedDocument<
  TDocument extends PHDocument = PHDocument,
>() {
  return useAtomValue(loadableSelectedDocumentAtom) as Loadable<
    TDocument | undefined
  >;
}

/** Returns a resolved promise of the selected document. */
export function useUnwrappedSelectedDocument<
  TDocument extends PHDocument = PHDocument,
>() {
  return useAtomValue(unwrappedSelectedDocumentAtom) as TDocument | undefined;
}

export function useDocumentTypeById(id: string | null | undefined) {
  const document = useUnwrappedDocumentById(id);
  return document?.header.documentType;
}

/** Returns the document type of the selected document. */
export function useSelectedDocumentType() {
  const selectedDocument = useUnwrappedSelectedDocument();
  return selectedDocument?.header.documentType;
}

/** Returns a loadable of a document for a reactor by id. */
export function useDocumentById<TDocument extends PHDocument = PHDocument>(
  id: string | null | undefined,
): Loadable<TDocument | undefined> {
  const documents = useDocuments();
  if (documents.state !== "hasData") return documents;

  if (!id) return { state: "hasData", data: undefined };

  const document = documents.data?.find((d) => d.header.id === id);
  return { state: "hasData", data: document } as Loadable<
    TDocument | undefined
  >;
}

/** Returns a resolved promise of a document for a reactor by id. */
export function useUnwrappedDocumentById<
  TDocument extends PHDocument = PHDocument,
>(id: string | null | undefined): TDocument | undefined {
  const documents = useUnwrappedDocuments();
  if (!id) return undefined;
  return documents?.find((d) => d.header.id === id) as TDocument | undefined;
}
