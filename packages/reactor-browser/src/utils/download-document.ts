import type { PHDocument } from "@powerhousedao/shared/document-model";
import normalizeException from "normalize-exception";
import { hasAtLeast } from "remeda";
import { exportFile } from "../actions/document.js";
import { showPHModal } from "../hooks/modals.js";
import { validateDocument } from "./validate-document.js";

function defaultHandleError(error: Error) {
  console.error(`Failed to export document: ${error.message}`);
}

function handleDocumentValidation(document: PHDocument) {
  if (hasAtLeast(validateDocument(document), 1)) return false;
  return true;
}

export function downloadDocument(
  document: PHDocument | undefined,
  handleError = defaultHandleError,
) {
  if (!document) return;
  const isValid = handleDocumentValidation(document);

  if (!isValid) {
    showPHModal({
      type: "downloadDocumentWithErrors",
      documentId: document.header.id,
    });
    return;
  }
  exportFile(document).catch((error) => handleError(normalizeException(error)));
}
