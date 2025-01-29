import { Action } from "document-model/document";
import {
  AddMessageInput,
  AddEmojiReactionInput,
  RemoveEmojiReactionInput,
  EditChatNameInput,
  EditChatDescriptionInput,
} from "../types";

export type AddMessageAction = Action<"ADD_MESSAGE", AddMessageInput, "global">;
export type AddEmojiReactionAction = Action<
  "ADD_EMOJI_REACTION",
  AddEmojiReactionInput,
  "global"
>;
export type RemoveEmojiReactionAction = Action<
  "REMOVE_EMOJI_REACTION",
  RemoveEmojiReactionInput,
  "global"
>;
export type EditChatNameAction = Action<
  "EDIT_CHAT_NAME",
  EditChatNameInput,
  "global"
>;
export type EditChatDescriptionAction = Action<
  "EDIT_CHAT_DESCRIPTION",
  EditChatDescriptionInput,
  "global"
>;

export type ChatRoomGeneralOperationsAction =
  | AddMessageAction
  | AddEmojiReactionAction
  | RemoveEmojiReactionAction
  | EditChatNameAction
  | EditChatDescriptionAction;
