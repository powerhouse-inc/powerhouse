import { ImmutableStateReducer, utils } from "document-model/document";
import { ScopeFrameworkState, ScopeFrameworkLocalState, z } from "./types";
import { ScopeFrameworkAction } from "./actions";

import { reducer as MainReducer } from "../src/reducers/main";

const stateReducer: ImmutableStateReducer<
  ScopeFrameworkState,
  ScopeFrameworkAction,
  ScopeFrameworkLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_ROOT_PATH":
      z.SetRootPathInputSchema().parse(action.input);
      MainReducer.setRootPathOperation(state[action.scope], action, dispatch);
      break;

    case "ADD_ELEMENT":
      z.AddElementInputSchema().parse(action.input);
      MainReducer.addElementOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_ELEMENT_TYPE":
      z.UpdateElementTypeInputSchema().parse(action.input);
      MainReducer.updateElementTypeOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "UPDATE_ELEMENT_NAME":
      z.UpdateElementNameInputSchema().parse(action.input);
      MainReducer.updateElementNameOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "UPDATE_ELEMENT_COMPONENTS":
      z.UpdateElementComponentsInputSchema().parse(action.input);
      MainReducer.updateElementComponentsOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "REMOVE_ELEMENT":
      z.RemoveElementInputSchema().parse(action.input);
      MainReducer.removeElementOperation(state[action.scope], action, dispatch);
      break;

    case "REORDER_ELEMENTS":
      z.ReorderElementsInputSchema().parse(action.input);
      MainReducer.reorderElementsOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "MOVE_ELEMENT":
      z.MoveElementInputSchema().parse(action.input);
      MainReducer.moveElementOperation(state[action.scope], action, dispatch);
      break;

    default:
      return state;
  }
};

export const reducer = utils.createReducer<
  ScopeFrameworkState,
  ScopeFrameworkAction,
  ScopeFrameworkLocalState
>(stateReducer);
