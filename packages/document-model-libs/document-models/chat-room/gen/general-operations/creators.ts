import {
    AddMessageInput,
    AddEmojiReactionInput,
    RemoveEmojiReactionInput,
    EditChatNameInput,
    EditChatDescriptionInput
} from "../types.js";
import {
    AddMessageAction,
    AddEmojiReactionAction,
    RemoveEmojiReactionAction,
    EditChatNameAction,
    EditChatDescriptionAction,
} from "./actions.js";



export const addMessage = (input: AddMessageInput) =>
  createAction<AddMessageAction>(
    "ADD_MESSAGE",
    { ...input },
    undefined,
    AddMessageInputSchema,
    "global",
  );

export const addEmojiReaction = (input: AddEmojiReactionInput) =>
  createAction<AddEmojiReactionAction>(
    "ADD_EMOJI_REACTION",
    { ...input },
    undefined,
    AddEmojiReactionInputSchema,
    "global",
  );

export const removeEmojiReaction = (input: RemoveEmojiReactionInput) =>
  createAction<RemoveEmojiReactionAction>(
    "REMOVE_EMOJI_REACTION",
    { ...input },
    undefined,
    RemoveEmojiReactionInputSchema,
    "global",
  );

export const editChatName = (input: EditChatNameInput) =>
  createAction<EditChatNameAction>(
    "EDIT_CHAT_NAME",
    { ...input },
    undefined,
    EditChatNameInputSchema,
    "global",
  );

export const editChatDescription = (input: EditChatDescriptionInput) =>
  createAction<EditChatDescriptionAction>(
    "EDIT_CHAT_DESCRIPTION",
    { ...input },
    undefined,
    EditChatDescriptionInputSchema,
    "global",
  );
