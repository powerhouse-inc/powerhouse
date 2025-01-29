import type { Document, ExtendedState } from "document-model/document";
import type { ChatRoomState } from "./schema/types";
import type { ChatRoomAction } from "./actions";

export { z } from "./schema";
export type * from "./schema/types";
type ChatRoomLocalState = Record<PropertyKey, never>;
export type ExtendedChatRoomState = ExtendedState<
  ChatRoomState,
  ChatRoomLocalState
>;
export type ChatRoomDocument = Document<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
>;
export { ChatRoomState, ChatRoomLocalState, ChatRoomAction };
