import { exportFile, showPHModal } from "@powerhousedao/reactor-browser";
import type { PHDocument } from "document-model";
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
