import type { PHDocument } from "document-model";
import { exportFile } from "../actions/document.js";
import { showPHModal } from "../hooks/modals.js";
import { validateDocument } from "./validate-document.js";

export const exportDocument = (document?: PHDocument) => {
  if (!document) return;
  const validationErrors = validateDocument(document);

  if (validationErrors.length) {
    showPHModal({
      type: "exportDocumentWithErrors",
      documentId: document.header.id,
    });
  } else {
    return exportFile(document);
  }
};
