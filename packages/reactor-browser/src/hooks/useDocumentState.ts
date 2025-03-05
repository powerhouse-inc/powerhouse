import { IDocumentDriveServer } from "document-drive";
import { useMemo } from "react";
import { useDocumentsState } from "./useDocumentsState.js";

type Args = {
  reactor: IDocumentDriveServer | undefined | null;
  driveId: string | undefined | null;
  documentId: string;
};

export function useDocumentState(args: Args) {
  const { reactor, driveId, documentId } = args;
  const state = useDocumentsState({
    reactor,
    driveId,
    documentIds: [documentId],
  });

  return useMemo(() => state[documentId], [state, documentId]);
}
