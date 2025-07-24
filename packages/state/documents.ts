import { type IDocumentDriveServer, logger } from "document-drive";
import { type PHDocument } from "document-model";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  baseDocumentsAtom,
  baseSelectedDriveIdAtom,
  documentsAtom,
  loadableDocumentsAtom,
  loadableSelectedDocumentAtom,
  unwrappedDocumentsAtom,
  unwrappedSelectedDocumentAtom,
} from "./atoms.js";
import { useUnwrappedReactor } from "./reactor.js";
import { type Loadable } from "./types.js";
import { NOT_SET } from "./utils.js";

/** Returns a loadable of the documents for a reactor. */
export function useDocuments() {
  return useAtomValue(loadableDocumentsAtom);
}

/** Returns a resolved promise of the documents for a reactor. */
export function useUnwrappedDocuments() {
  return useAtomValue(unwrappedDocumentsAtom);
}

/** Initializes the documents for a reactor. */
export function useInitializeDocuments() {
  const setDocuments = useSetAtom(documentsAtom);
  const baseSelectedDriveId = useAtomValue(baseSelectedDriveIdAtom);
  const baseDocuments = useAtomValue(baseDocumentsAtom);
  const reactor = useUnwrappedReactor();

  useEffect(() => {
    if (baseSelectedDriveId === NOT_SET) return;
    if (baseDocuments !== NOT_SET) return;

    async function handleInitializeDocuments() {
      if (!baseSelectedDriveId) return;
      if (!reactor) return;

      const documentIds = await reactor.getDocuments(baseSelectedDriveId);
      const documents = await Promise.all(
        documentIds.map((id) => reactor.getDocument(id)),
      );
      setDocuments(documents);
    }

    handleInitializeDocuments().catch((error: unknown) => logger.error(error));
  }, [baseSelectedDriveId, baseDocuments, setDocuments, reactor]);
}

/** Sets the documents for a reactor. */
export function useSetDocuments() {
  return useSetAtom(documentsAtom);
}

/** Refreshes the documents for a reactor. */
export function useRefreshDocuments() {
  const setDocuments = useSetDocuments();

  return useCallback(
    (reactor: IDocumentDriveServer, driveId: string | undefined) => {
      if (!driveId) {
        setDocuments([]);
        return;
      }

      reactor
        .getDocuments(driveId)
        .then(async (documentIds) => {
          const documents = await Promise.all(
            documentIds.map((id) => reactor.getDocument(id)),
          );
          setDocuments(documents);
        })
        .catch((error: unknown) => logger.error(error));
    },
    [setDocuments],
  );
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

  const document = documents.data.find((d) => d.header.id === id);
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
