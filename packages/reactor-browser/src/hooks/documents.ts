import {
  useDispatch,
  useDocumentModelModuleById,
  useFileNodes,
  useSelectedNodeId,
} from "@powerhousedao/reactor-browser";
import type { Action, BaseAction, PHDocument } from "document-model";
import { useSyncExternalStore } from "react";

function subscribeToDocuments(onStoreChange: () => void) {
  window.addEventListener("ph:setDocuments", onStoreChange);
  return () => window.removeEventListener("ph:setDocuments", onStoreChange);
}

export function useAllDocuments(): PHDocument[] | undefined {
  const documents = useSyncExternalStore(
    subscribeToDocuments,
    () => window.phDocuments,
  );
  return documents;
}

/** Returns the documents for the selected drive. */
export function useSelectedDriveDocuments(): PHDocument[] | undefined {
  const documents = useAllDocuments();
  const fileNodes = useFileNodes();
  const fileNodeIds = fileNodes?.map((node) => node.id);
  return documents?.filter((d) => fileNodeIds?.includes(d.header.id));
}

/** Returns the selected document. */
export function useSelectedDocument() {
  const selectedNodeId = useSelectedNodeId();
  const documents = useSelectedDriveDocuments();
  const selectedDocument = documents?.find(
    (d) => d.header.id === selectedNodeId,
  );
  return useDispatch(selectedDocument);
}

/** Returns the document type of a document by id. */
export function useDocumentTypeById(id: string | null | undefined) {
  const [document] = useDocumentById(id);
  return document?.header.documentType;
}

/** Returns the document type of the selected document. */
export function useSelectedDocumentType() {
  const [selectedDocument] = useSelectedDocument();
  return selectedDocument?.header.documentType;
}

/** Returns a document by id. */
export function useDocumentById(id: string | null | undefined) {
  const documents = useSelectedDriveDocuments();
  const document = documents?.find((d) => d.header.id === id);
  return useDispatch(document);
}

/** Returns a document of a specific type, throws an error if the found document has a different type */
export function useDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(id: string | null | undefined, type: string | null | undefined) {
  type DocumentDispatch = (
    actionOrActions:
      | TAction
      | TAction[]
      | BaseAction
      | BaseAction[]
      | undefined,
  ) => void;
  const [document, dispatch] = useDocumentById(id);
  const documentModelModule = useDocumentModelModuleById(type);

  if (!id || !type) return [];

  if (!document) {
    throw new Error(`Document with id ${id} is not found`);
  }
  if (!documentModelModule) {
    throw new Error(`Document model module for type ${type} not found`);
  }
  if (document.header.documentType !== type) {
    throw new Error(`Document ${id} is not of type ${type}`);
  }

  return [document, dispatch] as [TDocument, DocumentDispatch];
}
