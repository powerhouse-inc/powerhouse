import {
  type GetDocumentOptions,
  type IDocumentDriveServer,
} from "document-drive";
import { type PHDocumentHeader, type PHDocument } from "document-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type HookState = PHDocument["state"] &
  Pick<
    PHDocumentHeader,
    "documentType" | "revision" | "createdAtUtcIso" | "lastModifiedAtUtcIso"
  >;

export function useDocumentsState(args: {
  reactor: IDocumentDriveServer | undefined | null;
  driveId: string | undefined | null;
  documentIds?: string[];
  options?: GetDocumentOptions;
}): Record<string, HookState> {
  const { reactor, driveId, documentIds, options } = args;
  const [statesByDocumentId, setStatesByDocumentId] = useState<
    Record<string, HookState>
  >({});
  const isInitialized = useRef(false);
  const isSubscribed = useRef(false);

  useEffect(() => {
    async function initialize() {
      if (isInitialized.current) return;
      if (!reactor || !driveId) return;
      isInitialized.current = true;

      const ids = documentIds ?? (await reactor.getDocuments(driveId));
      const statesByDocumentId: Record<string, HookState> = {};
      for (const id of ids) {
        const document = await reactor.getDocument(driveId, id, options);
        statesByDocumentId[id] = {
          ...document.state,
          documentType: document.header.documentType,
          revision: document.header.revision,
          createdAtUtcIso: document.header.createdAtUtcIso,
          lastModifiedAtUtcIso: document.header.lastModifiedAtUtcIso,
        };
      }
      setStatesByDocumentId(statesByDocumentId);
    }
    void initialize();
  }, [reactor, driveId, options]);

  useEffect(() => {
    if (!reactor || !driveId) return;
    if (isSubscribed.current) return;
    isSubscribed.current = true;

    const unsubscribe = reactor.on("strandUpdate", async (update) => {
      if (
        update.driveId !== driveId ||
        (documentIds && !documentIds.includes(update.documentId))
      )
        return;

      const updatedDocument = await reactor.getDocument(
        driveId,
        update.documentId,
        options,
      );
      setStatesByDocumentId((prev) => {
        const newStatesByDocumentId = { ...prev };
        newStatesByDocumentId[update.documentId] = {
          ...updatedDocument.state,
          documentType: updatedDocument.header.documentType,
          revision: updatedDocument.header.revision,
          createdAtUtcIso: updatedDocument.header.createdAtUtcIso,
          lastModifiedAtUtcIso: updatedDocument.header.lastModifiedAtUtcIso,
        };
        return newStatesByDocumentId;
      });
    });
    return unsubscribe;
  }, [reactor, driveId, options]);

  return useMemo(() => statesByDocumentId, [statesByDocumentId]);
}

export function makeDriveDocumentStatesHook(
  reactor: IDocumentDriveServer | undefined | null,
) {
  const useDriveDocumentStates = useCallback(
    (args: {
      driveId: string | undefined | null;
      documentIds?: string[];
      options?: GetDocumentOptions;
    }) => {
      const { driveId, documentIds, options } = args;
      return useDocumentsState({
        reactor,
        driveId,
        documentIds,
        options,
      });
    },
    [reactor],
  );

  return useDriveDocumentStates;
}

export function makeDriveDocumentStateHook(
  reactor: IDocumentDriveServer | undefined | null,
) {
  const useDriveDocumentState = useCallback(
    (args: { driveId: string | undefined | null; documentId: string }) => {
      const { driveId, documentId } = args;
      return useDocumentState({
        reactor,
        driveId,
        documentId,
      });
    },
    [reactor],
  );

  return useDriveDocumentState;
}

export function useDocumentState(args: {
  reactor: IDocumentDriveServer | undefined | null;
  driveId: string | undefined | null;
  documentId: string;
}) {
  const { reactor, driveId, documentId } = args;
  const state = useDocumentsState({
    reactor,
    driveId,
    documentIds: [documentId],
  });

  return useMemo(() => state[documentId], [state, documentId]);
}
