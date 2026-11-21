/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ChatSessionAction } from "./actions.js";
import type { ChatSessionState as ChatSessionGlobalState } from "./schema/types.js";

type ChatSessionLocalState = Record<PropertyKey, never>;

type ChatSessionPHState = PHBaseState & {
  global: ChatSessionGlobalState;
  local: ChatSessionLocalState;
};
type ChatSessionDocument = PHDocument<ChatSessionPHState>;

export * from "./schema/types.js";

export type {
  ChatSessionAction,
  ChatSessionDocument,
  ChatSessionGlobalState,
  ChatSessionLocalState,
  ChatSessionPHState,
};
