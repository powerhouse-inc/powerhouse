import { GetDocumentOptions, IDocumentDriveServer } from "document-drive";
import { PHDocument } from "document-model";
import { useEffect, useMemo, useRef, useState } from "react";

type Args = {
  reactor: IDocumentDriveServer | undefined | null;
  driveId: string | undefined | null;
  documentIds?: string[];
  options?: GetDocumentOptions;
};

export function useDocumentsState(
  args: Args,
): Record<string, PHDocument["state"]> {
  const { reactor, driveId, documentIds, options } = args;
  const [statesByDocumentId, setStatesByDocumentId] = useState<
    Record<string, PHDocument["state"]>
  >({});
  const isInitialized = useRef(false);
  const isSubscribed = useRef(false);

  useEffect(() => {
    async function initialize() {
      if (isInitialized.current) return;
      if (!reactor || !driveId) return;
      isInitialized.current = true;

      const ids = documentIds ?? (await reactor.getDocuments(driveId));
      const statesByDocumentId: Record<string, PHDocument["state"]> = {};
      for (const id of ids) {
        const document = await reactor.getDocument(driveId, id, options);
        statesByDocumentId[id] = document.state;
      }
      setStatesByDocumentId(statesByDocumentId);
    }
    void initialize();
  }, [reactor, driveId, options]);

  useEffect(() => {
    if (!reactor || !driveId) return;
    if (isSubscribed.current) return;
    isSubscribed.current = true;
    console.log("subscribing to strandUpdate");
    const unsubscribe = reactor.on("strandUpdate", async (update) => {
      console.log("strandUpdate", update);
      if (documentIds && !documentIds.includes(update.documentId)) return;

      const updatedDocument = await reactor.getDocument(
        driveId,
        update.documentId,
        options,
      );
      setStatesByDocumentId((prev) => {
        const newStatesByDocumentId = { ...prev };
        newStatesByDocumentId[update.documentId] = updatedDocument.state;
        return newStatesByDocumentId;
      });
    });
    return unsubscribe;
  }, [reactor, driveId, options]);

  return useMemo(() => statesByDocumentId, [statesByDocumentId]);
}
