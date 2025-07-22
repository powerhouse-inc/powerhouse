import { useCallback } from "react";
import { useRefreshDocuments } from "./documents.js";
import { useRefreshDrives } from "./drives.js";

/** Returns a function that refreshes the drives and documents for a reactor. */
export function useRefreshDrivesAndDocuments() {
  const refreshDrives = useRefreshDrives();
  const refreshDocuments = useRefreshDocuments();

  return useCallback(() => {
    refreshDrives();
    refreshDocuments();
  }, [refreshDrives, refreshDocuments]);
}
