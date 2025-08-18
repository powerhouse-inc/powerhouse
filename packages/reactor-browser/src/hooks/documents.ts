import { useSyncExternalStore } from "react";
import { useDispatch } from "./dispatch.js";
import { useFileNodes, useSelectedNodeId } from "./nodes.js";

function getDocumentsSnapshot() {
  const documents = window.phDocuments;
  return documents;
}

function subscribeToDocuments(onStoreChange: () => void) {
  window.addEventListener("ph:setDocuments", onStoreChange);
  return () => window.removeEventListener("ph:setDocuments", onStoreChange);
}

export function useAllDocuments() {
  const documents = useSyncExternalStore(
    subscribeToDocuments,
    getDocumentsSnapshot,
  );
  return documents;
}

/** Returns the documents for the selected drive. */
export function useSelectedDriveDocuments() {
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
