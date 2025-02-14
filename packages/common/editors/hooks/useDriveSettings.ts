import { DocumentModel } from "document-model/document";
import { createContext, useContext } from "react";
interface DriveSettings {
  showSearchBar: boolean;
  isAllowedToCreateDocuments: boolean;
  documentModels?: DocumentModel[];
}

const DriveSettingsContext = createContext<DriveSettings>({
  showSearchBar: true,
  isAllowedToCreateDocuments: true,
  documentModels: [],
});

export const DriveSettingsProvider = DriveSettingsContext.Provider;

export function useDriveSettings() {
  const context = useContext(DriveSettingsContext);
  if (!context) {
    throw new Error(
      "useDriveSettings must be used within a DriveSettingsProvider",
    );
  }
  return context;
}
