import { useCallback } from "react";
import { useRefreshDocuments } from "./documents.js";
import { useRefreshDrives } from "./drives.js";

export function useSyncDrivesAndDocumentsWithReactor() {
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();

  return useCallback(() => {
    refreshDrives();
    refreshDocuments();
  }, [refreshDrives, refreshDocuments]);
}
