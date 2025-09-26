import type { Action } from "document-model";
import { type DocumentModelModule, type PHDocument } from "document-model";
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

export function useAllDocuments(): PHDocument[] | undefined {
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

export type BaseCreators = {
  setName: (name: string) => Action & { type: "SET_NAME"; input: string };
};

type ExtractModulePHState<TModule> =
  TModule extends DocumentModelModule<infer U> ? U : never;

export type UseDocumentReturn<
  TModule,
  TCreators extends Record<string, (...args: any[]) => any> = Record<
    string,
    (...args: any[]) => any
  >,
> = [
  PHDocument<ExtractModulePHState<TModule>>,
  (
    actionOrActions:
      | ReturnType<TCreators[keyof TCreators]>[]
      | ReturnType<TCreators[keyof TCreators]>
      | undefined,
  ) => void,
  TCreators,
];

export function useDocumentOfModule<
  TModule extends DocumentModelModule<any>,
  TCreators extends Record<string, (...args: any[]) => any> = Record<
    string,
    (...args: any[]) => any
  >,
>(
  documentId: string,
  documentModule: TModule,
  actionCreators: TCreators,
): UseDocumentReturn<TModule, TCreators & BaseCreators> {
  const [document, dispatch] = useDocumentById(documentId);

  if (!document) {
    throw new Error(`Document with id ${documentId} not found`);
  }

  const documentType = documentModule.documentModel.id;

  if (document.header.documentType !== documentType) {
    throw new Error(
      `Document with id ${documentId} is not of type ${documentType}. Actual type: ${document.header.documentType}`,
    );
  }

  // TODO: validate document instead of type cast
  // documentModelModule.utils.validateDocument(document);

  return [
    document as PHDocument<ExtractModulePHState<TModule>>,
    dispatch,
    actionCreators as TCreators & BaseCreators,
  ] as const;
}
