import { type IDocumentDriveServer, type StrandUpdate } from "document-drive";
import { type PHDocument } from "document-model";
import { useCallback, useEffect, useState } from "react";

export type DocumentMeta = {
  documentId?: string;
  documentType?: string;
};

export function useDocument(
  reactor: IDocumentDriveServer | undefined,
  documentMeta: DocumentMeta = {},
) {
  const { documentId, documentType } = documentMeta;

  const [document, setDocument] = useState<PHDocument | undefined>();

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
    if (!documentId || !documentType) return;

    reactor.getDocument(documentId).then(setDocument).catch(console.error);
  }, [documentId, documentType, reactor]);

  useEffect(() => {
    if (!reactor) return;
    if (!documentId || !documentType) return;

    const removeListener = onStrandUpdate((strand) => {
      if (strand.documentId === documentId) {
        reactor.getDocument(documentId).then(setDocument).catch(console.error);
      }
    });

    return removeListener;
  }, [onStrandUpdate, documentId, documentType]);

  return document;
}
