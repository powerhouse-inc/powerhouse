import { StateReducer, utils } from "document-model";
import { ChatRoomAction } from "./actions.js";
import { ChatRoomLocalState, ChatRoomState } from "./types";

import { reducer as GeneralOperationsReducer } from "../src/reducers/general-operations";

const stateReducer: StateReducer<
  ChatRoomState,
  ChatRoomAction,
  ChatRoomLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_MESSAGE":
      AddMessageInputSchema().parse(action.input);
      GeneralOperationsReducer.addMessageOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_EMOJI_REACTION":
      AddEmojiReactionInputSchema().parse(action.input);
      GeneralOperationsReducer.addEmojiReactionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "REMOVE_EMOJI_REACTION":
      RemoveEmojiReactionInputSchema().parse(action.input);
      GeneralOperationsReducer.removeEmojiReactionOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "EDIT_CHAT_NAME":
      EditChatNameInputSchema().parse(action.input);
      GeneralOperationsReducer.editChatNameOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "EDIT_CHAT_DESCRIPTION":
      EditChatDescriptionInputSchema().parse(action.input);
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
