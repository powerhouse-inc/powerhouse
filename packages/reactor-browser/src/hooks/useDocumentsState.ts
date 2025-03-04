import { GetDocumentOptions, IDocumentDriveServer } from "document-drive";
import { PHDocument } from "document-model";
import { useEffect, useMemo, useRef, useState } from "react";

type Args = {
  reactor: IDocumentDriveServer | undefined | null;
  driveId: string | undefined | null;
  options?: GetDocumentOptions;
};

export function useDocumentsState(
  args: Args,
): Record<string, PHDocument["state"]> {
  const { reactor, driveId, options } = args;
  const [statesByDocumentId, setStatesByDocumentId] = useState<
    Record<string, PHDocument["state"]>
  >({});
  const isInitialized = useRef(false);

  useEffect(() => {
    async function initialize() {
      if (isInitialized.current) return;
      if (!reactor || !driveId) return;
      isInitialized.current = true;

      const documentIds = await reactor.getDocuments(driveId);
      const statesByDocumentId: Record<string, PHDocument["state"]> = {};
      for (const id of documentIds) {
        const document = await reactor.getDocument(driveId, id, options);
        statesByDocumentId[id] = document.state;
      }
      setStatesByDocumentId(statesByDocumentId);
    }
    void initialize();
  }, [reactor, driveId, options]);

  useEffect(() => {
    if (!reactor || !driveId) return;
    const unsubscribe = reactor.on("strandUpdate", async (update) => {
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
