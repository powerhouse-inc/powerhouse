import {
  makePHEventFunctions,
  useDispatch,
  useDocumentModelModuleById,
  useFileNodes,
  useNodeKind,
  useSelectedNodeId,
} from "@powerhousedao/reactor-browser";
import type { Action, DocumentAction, PHDocument } from "document-model";

export const {
  useValue: useAllDocuments,
  setValue: setDocuments,
  addEventHandler: addDocumentsEventHandler,
} = makePHEventFunctions<PHDocument[]>("phDocuments");

export const {
  useValue: useSelectedTimelineRevision,
  setValue: setSelectedTimelineRevision,
  addEventHandler: addSelectedTimelineRevisionEventHandler,
} = makePHEventFunctions<string | number | null>("selectedTimelineRevision");

/** Returns the documents for the selected drive. */
export function useSelectedDriveDocuments(): PHDocument[] | undefined {
  const documents = useAllDocuments();
  const fileNodes = useFileNodes();
  const fileNodeIds = fileNodes?.map((node) => node.id);
  return documents?.filter((d) => fileNodeIds?.includes(d.header.id));
}

/** Returns the selected document id */
export function useSelectedDocumentId() {
  const selectedNodeId = useSelectedNodeId();
  const kind = useNodeKind(selectedNodeId);
  if (kind === "FILE") {
    return selectedNodeId;
  }
  return undefined;
}

/** Returns the selected document. */
export function useSelectedDocument() {
  const selectedNodeId = useSelectedDocumentId();
  return useDocumentById(selectedNodeId);
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

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document with id ${documentId} not found`);
  }
}

export class DocumentModelNotFoundError extends Error {
  constructor(documentType: string) {
    super(`Document model module for type ${documentType} not found`);
  }
}

export class DocumentTypeMismatchError extends Error {
  constructor(documentId: string, expectedType: string, actualType: string) {
    super(
      `Document ${documentId} is not of type ${expectedType}. Actual type: ${actualType}`,
    );
  }
}

export type DocumentDispatch<TAction extends Action> = (
  actionOrActions:
    | TAction
    | TAction[]
    | DocumentAction
    | DocumentAction[]
    | undefined,
) => void;

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

export function useSelectedDocumentOfType(
  documentType: null | undefined,
): never[];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(documentType: string): [TDocument, DocumentDispatch<TAction>];
export function useSelectedDocumentOfType<
  TDocument extends PHDocument,
  TAction extends Action,
>(
  documentType: string | null | undefined,
): never[] | [TDocument, DocumentDispatch<TAction>] {
  const documentId = useSelectedDocumentId();

  if (!documentType) {
    return [];
  }
  if (!documentId) {
    throw new Error(
      "There is no selected document. Call 'setSelectedNode' to select a document.",
    );
  }
  return useDocumentOfType<TDocument, TAction>(documentId, documentType);
}
