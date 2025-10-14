import { type DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  DocumentModelNotFoundError,
  DocumentNotFoundError,
} from "document-drive";
import type { Action, PHDocument } from "document-model";
import {
  DocumentTypeMismatchError,
  NoSelectedDocumentError,
} from "../errors.js";
import { useDispatch } from "./dispatch.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { useFileNodes, useNodeKind, useSelectedNodeId } from "./nodes.js";
import { useDocumentModelModuleById } from "./vetra-packages.js";

const documentEventFunctions = makePHEventFunctions("documents");

/** Returns all documents in the reactor. */
export const useAllDocuments = documentEventFunctions.useValue;

/** Sets all of the documents in the reactor. */
export const setDocuments = documentEventFunctions.setValue;

/** Adds an event handler for all of the documents in the reactor. */
export const addDocumentsEventHandler = documentEventFunctions.addEventHandler;

export const selectedTimelineRevisionEventFunctions = makePHEventFunctions(
  "selectedTimelineRevision",
);

/** Returns the selected timeline revision. */
export const useSelectedTimelineRevision =
  selectedTimelineRevisionEventFunctions.useValue;

/** Sets the selected timeline revision. */
export const setSelectedTimelineRevision =
  selectedTimelineRevisionEventFunctions.setValue;

/** Adds an event handler for the selected timeline revision. */
export const addSelectedTimelineRevisionEventHandler =
  selectedTimelineRevisionEventFunctions.addEventHandler;

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

/** Returns the selected document of a specific type, throws an error if the found document has a different type */
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
    throw new NoSelectedDocumentError();
  }
  return useDocumentOfType<TDocument, TAction>(documentId, documentType);
}
