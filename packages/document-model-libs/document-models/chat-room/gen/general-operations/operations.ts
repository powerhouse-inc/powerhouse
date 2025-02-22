import { SignalDispatch } from "document-model/document";
import {
  AddMessageAction,
  AddEmojiReactionAction,
  RemoveEmojiReactionAction,
  EditChatNameAction,
  EditChatDescriptionAction,
} from "./actions";
import { ChatRoomState } from "../types";

export interface ChatRoomGeneralOperationsOperations {
  addMessageOperation: (
    state: ChatRoomState,
    action: AddMessageAction,
    dispatch?: SignalDispatch,
  ) => void;
  addEmojiReactionOperation: (
    state: ChatRoomState,
    action: AddEmojiReactionAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeEmojiReactionOperation: (
    state: ChatRoomState,
    action: RemoveEmojiReactionAction,
    dispatch?: SignalDispatch,
  ) => void;
  editChatNameOperation: (
    state: ChatRoomState,
    action: EditChatNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  editChatDescriptionOperation: (
    state: ChatRoomState,
    action: EditChatDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
