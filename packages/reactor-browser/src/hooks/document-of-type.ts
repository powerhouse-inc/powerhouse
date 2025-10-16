import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  DocumentModelNotFoundError,
  DocumentNotFoundError,
} from "document-drive";
import type { Action, PHDocument } from "document-model";
import { DocumentTypeMismatchError } from "../errors.js";
import { useDocumentById } from "./document-by-id.js";
import { useDocumentModelModuleById } from "./document-model-modules.js";

/** Returns a document of a specific type, throws an error if the found document has a different type */
export function useDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(
  documentId: string | null | undefined,
  documentType: string | null | undefined,
) {
  const [document, dispatch] = useDocumentById(documentId);
  const documentModelModule = useDocumentModelModuleById(documentType);

  if (!documentId || !documentType) return [];

  if (!document) {
    throw new DocumentNotFoundError(documentId);
  }
  if (!documentModelModule) {
    throw new DocumentModelNotFoundError(documentType);
  }

  if (document.header.documentType !== documentType) {
    throw new DocumentTypeMismatchError(
      documentId,
      documentType,
      document.header.documentType,
    );
  }

  return [document, dispatch] as [TDocument, DocumentDispatch<TAction>];
}
