import { useCallback, useEffect, useState } from "react";
import { Document } from "document-model/document";
import { IDocumentDriveServer, StrandUpdate } from "document-drive/server";

export type DocumentMeta = {
  driveId?: string;
  documentId?: string;
  documentType?: string;
};

export function useDocument(
  reactor: IDocumentDriveServer | undefined,
  documentMeta: DocumentMeta = {},
) {
  const { documentId, documentType, driveId } = documentMeta;

  const [document, setDocument] = useState<Document | undefined>();

  const onStrandUpdate = useCallback(
    (cb: (update: StrandUpdate) => void) => {
      if (!reactor) {
        throw new Error("Reactor is not loaded");
      }
      return reactor.on("strandUpdate", cb);
    },
    [reactor],
  );

  useEffect(() => {
    if (!reactor) return;
    if (!driveId || !documentId || !documentType) return;

    reactor
      .getDocument(driveId, documentId)
      .then(setDocument)
      .catch(console.error);
  }, [driveId, documentId, documentType, reactor]);

  useEffect(() => {
    if (!reactor) return;
    if (!driveId || !documentId || !documentType) return;

    const removeListener = onStrandUpdate((strand) => {
      if (strand.driveId === driveId && strand.documentId === documentId) {
        reactor
          .getDocument(driveId, documentId)
          .then(setDocument)
          .catch(console.error);
      }
    });

    return removeListener;
  }, [onStrandUpdate, driveId, documentId, documentType]);

  return document;
}