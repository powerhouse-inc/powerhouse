import { logger } from "document-drive";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useSelectedDriveId } from "../hooks/drives.js";
import { documentsAtom } from "./atoms.js";

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
