import { useReactor, useSelectedDriveId } from "@powerhousedao/reactor-browser";
import type { DocumentModelDocument } from "document-model";
import { useEffect, useState } from "react";

const DEFAULT_DRIVE_ID = "vetra";

export function useAvailableDocumentTypes(
  onlyVetraDocuments = false,
): string[] {
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<
    string[]
  >([]);
  const reactor = useReactor();
  const selectedDriveId = useSelectedDriveId();

  useEffect(() => {
    async function loadDocumentTypes() {
      const moduleDocIds: string[] = [];

      // Get from reactor document model modules (if not onlyVetraDocuments)
      if (!onlyVetraDocuments) {
        const docModels = reactor?.getDocumentModelModules() ?? [];
        moduleDocIds.push(...docModels.map((model) => model.documentModel.id));
      }

      // Get from vetra drive
      const driveDocIds: string[] = [];
      const driveDocs = await reactor?.getDocuments(
        selectedDriveId ?? DEFAULT_DRIVE_ID,
      );

      if (driveDocs) {
        for (const docId of driveDocs) {
          const document = await reactor?.getDocument(docId);
          if (document?.header.documentType === "powerhouse/document-model") {
            const documentModel = document as DocumentModelDocument;
            driveDocIds.push(documentModel.state.global.id);
          }
        }
      }

      // Combine and deduplicate (or just use driveDocIds if onlyVetraDocuments)
      const uniqueIds = onlyVetraDocuments
        ? driveDocIds
        : [...new Set([...moduleDocIds, ...driveDocIds])];
      setAvailableDocumentTypes(uniqueIds);
    }

    void loadDocumentTypes();
  }, [reactor, selectedDriveId, onlyVetraDocuments]);

  return availableDocumentTypes;
}
