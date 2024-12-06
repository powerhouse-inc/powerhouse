/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { ChatRoomGeneralOperationsOperations } from "../../gen/general-operations/operations";
import { MessageContentCannotBeEmpty } from "../../gen/general-operations/error";

export const reducer: ChatRoomGeneralOperationsOperations = {
  addMessageOperation(state, action, dispatch) {
    if (action.input.content === "") {
      throw new MessageContentCannotBeEmpty();
    }

    state.messages.push({
      id: action.input.messageId,
      content: action.input.content,
      sender: action.input.sender,
      sentAt: action.input.sentAt,
      reactions: [],
    });
  },
  addEmojiReactionOperation(state, action, dispatch) {
    const message = state.messages.find(
      (message) => message.id === action.input.messageId,
    );

    if (!message) {
      throw new Error("Message not found");
    }

    const reactions = message.reactions || [];

    const existingReaction = reactions.find(
      (reaction) => reaction.type === action.input.type,
    );

    if (existingReaction) {
      message.reactions = reactions.map((reaction) => {
        if (reaction.type === action.input.type) {
          return {
            ...reaction,
            reactedBy: [...reaction.reactedBy, action.input.reactedBy],
          };
        }

        return reaction;
      });
    } else {
      message.reactions = [
        ...reactions,
        {
          reactedBy: [action.input.reactedBy],
          type: action.input.type,
        },
      ];
    }

    state.messages = state.messages.map((_message) => {
      if (_message.id === message.id) {
        return message;
      }

      return _message;
    });
  },
  removeEmojiReactionOperation(state, action, dispatch) {
    state.messages = state.messages.map((message) => {
      if (message.id === action.input.messageId) {
        message.reactions = (message.reactions || []).map((reaction) => {
          if (reaction.type === action.input.type) {
            return {
              ...reaction,
              reactedBy: reaction.reactedBy.filter(
                (reactedBy) => reactedBy !== action.input.senderId,
              ),
            };
          }

          return reaction;
        });
      }

      return message;
    });
  },
  editChatNameOperation(state, action, dispatch) {
    state.name = action.input.name || "";
  },
  editChatDescriptionOperation(state, action, dispatch) {
    state.description = action.input.description || "";
  },
};
