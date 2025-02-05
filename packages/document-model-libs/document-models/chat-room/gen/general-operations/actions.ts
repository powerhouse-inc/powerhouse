import {
    AddMessageInput,
    AddEmojiReactionInput,
    RemoveEmojiReactionInput,
    EditChatNameInput,
    EditChatDescriptionInput,
} from "../types.js";

export type AddMessageAction = BaseAction<"ADD_MESSAGE", AddMessageInput, "global">;
export type AddEmojiReactionAction = BaseAction<
  "ADD_EMOJI_REACTION",
  AddEmojiReactionInput,
  "global"
>;
export type RemoveEmojiReactionAction = BaseAction<
  "REMOVE_EMOJI_REACTION",
  RemoveEmojiReactionInput,
  "global"
>;
export type EditChatNameAction = BaseAction<
  "EDIT_CHAT_NAME",
  EditChatNameInput,
  "global"
>;
export type EditChatDescriptionAction = BaseAction<
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
