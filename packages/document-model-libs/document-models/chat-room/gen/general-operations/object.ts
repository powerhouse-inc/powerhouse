import { BaseDocument } from "document-model/document";
import {
  AddMessageInput,
  AddEmojiReactionInput,
  RemoveEmojiReactionInput,
  EditChatNameInput,
  EditChatDescriptionInput,
  ChatRoomState,
  ChatRoomLocalState,
} from "../types";
import {
  addMessage,
  addEmojiReaction,
  removeEmojiReaction,
  editChatName,
  editChatDescription,
} from "./creators";
import { ChatRoomAction } from "../actions";

export default class ChatRoom_GeneralOperations extends BaseDocument<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> {
  public addMessage(input: AddMessageInput) {
    return this.dispatch(addMessage(input));
  }

  public addEmojiReaction(input: AddEmojiReactionInput) {
    return this.dispatch(addEmojiReaction(input));
  }

  public removeEmojiReaction(input: RemoveEmojiReactionInput) {
    return this.dispatch(removeEmojiReaction(input));
  }

  public editChatName(input: EditChatNameInput) {
    return this.dispatch(editChatName(input));
  }

  public editChatDescription(input: EditChatDescriptionInput) {
    return this.dispatch(editChatDescription(input));
  }
}
