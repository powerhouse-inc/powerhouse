import { utils } from "document-model/document";
import {
  z,
  AddMessageInput,
  AddEmojiReactionInput,
  RemoveEmojiReactionInput,
  EditChatNameInput,
  EditChatDescriptionInput,
} from "../types";
import {
  AddMessageAction,
  AddEmojiReactionAction,
  RemoveEmojiReactionAction,
  EditChatNameAction,
  EditChatDescriptionAction,
} from "./actions";

const { createAction } = utils;

export const addMessage = (input: AddMessageInput) =>
  createAction<AddMessageAction>(
    "ADD_MESSAGE",
    { ...input },
    undefined,
    z.AddMessageInputSchema,
    "global",
  );

export const addEmojiReaction = (input: AddEmojiReactionInput) =>
  createAction<AddEmojiReactionAction>(
    "ADD_EMOJI_REACTION",
    { ...input },
    undefined,
    z.AddEmojiReactionInputSchema,
    "global",
  );

export const removeEmojiReaction = (input: RemoveEmojiReactionInput) =>
  createAction<RemoveEmojiReactionAction>(
    "REMOVE_EMOJI_REACTION",
    { ...input },
    undefined,
    z.RemoveEmojiReactionInputSchema,
    "global",
  );

export const editChatName = (input: EditChatNameInput) =>
  createAction<EditChatNameAction>(
    "EDIT_CHAT_NAME",
    { ...input },
    undefined,
    z.EditChatNameInputSchema,
    "global",
  );

export const editChatDescription = (input: EditChatDescriptionInput) =>
  createAction<EditChatDescriptionAction>(
    "EDIT_CHAT_DESCRIPTION",
    { ...input },
    undefined,
    z.EditChatDescriptionInputSchema,
    "global",
  );
