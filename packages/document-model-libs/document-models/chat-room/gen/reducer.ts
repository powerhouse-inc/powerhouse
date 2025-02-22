import { ImmutableStateReducer, utils } from "document-model/document";
import { ChatRoomState, ChatRoomLocalState, z } from "./types";
import { ChatRoomAction } from "./actions";

import { reducer as GeneralOperationsReducer } from "../src/reducers/general-operations";

const stateReducer: ImmutableStateReducer<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_MESSAGE":
      z.AddMessageInputSchema().parse(action.input);
      GeneralOperationsReducer.addMessageOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_EMOJI_REACTION":
      z.AddEmojiReactionInputSchema().parse(action.input);
      GeneralOperationsReducer.addEmojiReactionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "REMOVE_EMOJI_REACTION":
      z.RemoveEmojiReactionInputSchema().parse(action.input);
      GeneralOperationsReducer.removeEmojiReactionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "EDIT_CHAT_NAME":
      z.EditChatNameInputSchema().parse(action.input);
      GeneralOperationsReducer.editChatNameOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "EDIT_CHAT_DESCRIPTION":
      z.EditChatDescriptionInputSchema().parse(action.input);
      GeneralOperationsReducer.editChatDescriptionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer = utils.createReducer<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
>(stateReducer);
