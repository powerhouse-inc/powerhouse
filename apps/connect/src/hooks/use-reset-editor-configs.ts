import {
  defaultPHAppConfig,
  defaultPHDocumentEditorConfig,
} from "@powerhousedao/connect/config";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";
import {
  setPHAppConfig,
  setPHDocumentEditorConfig,
} from "@powerhousedao/reactor-browser";
import { useEffect } from "react";

/** Puts back the default editor and app configs once nothing is open. */
export function useResetEditorConfigs() {
  const { drive: selectedDrive, documentId: selectedDocumentId } =
    useDriveRouteData();

  useEffect(() => {
    if (!selectedDocumentId) {
      setPHDocumentEditorConfig(defaultPHDocumentEditorConfig);
    }
  }, [selectedDocumentId]);

  useEffect(() => {
    if (!selectedDrive) {
      setPHAppConfig(defaultPHAppConfig);
    }
  }, [selectedDrive]);
}
