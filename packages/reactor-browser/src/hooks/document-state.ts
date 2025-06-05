import {
  type GetDocumentOptions,
  type IDocumentDriveServer,
  type SyncStatus,
} from "document-drive";
import {
  type Action,
  type ActionErrorCallback,
  type DocumentModelModule,
  type PHDocument,
  type User,
} from "document-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type HookState = PHDocument["state"] &
  Pick<PHDocument, "documentType" | "revision" | "created" | "lastModified">;

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
          documentType: document.documentType,
          revision: document.revision,
          created: document.created,
          lastModified: document.lastModified,
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
          documentType: updatedDocument.documentType,
          revision: updatedDocument.revision,
          created: updatedDocument.created,
          lastModified: updatedDocument.lastModified,
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

export type DocumentStateHooks = {
  /**
   * Retrieves the sync status of a document or drive
   * @param driveId - ID of the drive to check sync status for
   * @param documentId - ID of the document to check sync status for
   * @returns SyncStatus object containing sync information
   */
  useSyncStatus: (
    driveId: string,
    documentId?: string,
  ) => SyncStatus | undefined;

  useDocumentEditorProps: (props: {
    driveId: string;
    documentId: string;
    documentType: string;
    documentModelModule: DocumentModelModule<PHDocument>;
    user?: User;
  }) => {
    dispatch: (action: Action, onErrorCallback?: ActionErrorCallback) => void;
    document: PHDocument | undefined;
    error: unknown;
  };

  /**
   * Retrieves the states of all documents in a drive
   * @param driveId - ID of the drive to retrieve document states for
   * @param documentIds - IDs of the documents to retrieve states for (all if not provided)
   * @returns Record of document IDs to their states
   */
  useDriveDocumentStates: (props: {
    driveId: string;
    documentIds?: string[];
  }) => readonly [
    Record<string, HookState>,
    (_driveId: string, _documentIds?: string[]) => Promise<void>,
  ];

  /**
   * Retrieves the state of a document in a drive
   * @param driveId - ID of the drive to retrieve document state for
   * @param documentId - ID of the document to retrieve state for
   * @type TDocument - Type of the document to retrieve state for if known
   * @returns State of the document
   */
  useDriveDocumentState: (props: {
    driveId: string;
    documentId: string;
  }) => PHDocument["state"] | undefined;
};
