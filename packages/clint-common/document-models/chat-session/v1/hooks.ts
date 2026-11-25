/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  ChatSessionAction,
  ChatSessionDocument,
} from "document-models/chat-session/v1";
import {
  assertIsChatSessionDocument,
  isChatSessionDocument,
} from "./gen/document-schema.js";

/** Hook to get a ChatSession document by its id */
export function useChatSessionDocumentById(
  documentId: string | null | undefined,
):
  | [ChatSessionDocument, DocumentDispatch<ChatSessionAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isChatSessionDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ChatSession document */
export function useSelectedChatSessionDocument(): [
  ChatSessionDocument,
  DocumentDispatch<ChatSessionAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsChatSessionDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ChatSession documents in the selected drive */
export function useChatSessionDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isChatSessionDocument);
}

/** Hook to get all ChatSession documents in the selected folder */
export function useChatSessionDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isChatSessionDocument);
}
