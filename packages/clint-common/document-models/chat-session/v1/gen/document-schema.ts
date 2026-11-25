/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { chatSessionDocumentType } from "./document-type.js";
import { ChatSessionStateSchema } from "./schema/zod.js";
import type { ChatSessionDocument, ChatSessionPHState } from "./types.js";

/** Schema for validating the header object of a ChatSession document */
export const ChatSessionDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(chatSessionDocumentType),
});

/** Schema for validating the state object of a ChatSession document */
export const ChatSessionPHStateSchema = BaseDocumentStateSchema.extend({
  global: ChatSessionStateSchema(),
});

export const ChatSessionDocumentSchema = z.object({
  header: ChatSessionDocumentHeaderSchema,
  state: ChatSessionPHStateSchema,
  initialState: ChatSessionPHStateSchema,
});

/** Simple helper function to check if a state object is a ChatSession document state object */
export function isChatSessionState(
  state: unknown,
): state is ChatSessionPHState {
  return ChatSessionPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ChatSession document state object */
export function assertIsChatSessionState(
  state: unknown,
): asserts state is ChatSessionPHState {
  ChatSessionPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ChatSession document */
export function isChatSessionDocument(
  document: unknown,
): document is ChatSessionDocument {
  return ChatSessionDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ChatSession document */
export function assertIsChatSessionDocument(
  document: unknown,
): asserts document is ChatSessionDocument {
  ChatSessionDocumentSchema.parse(document);
}
