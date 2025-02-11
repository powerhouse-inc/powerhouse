import { ImmutableStateReducer, utils } from "document-model";
import { DocumentDriveAction } from "./actions.js";
import { DocumentDriveLocalState, DocumentDriveState } from "./types.js";

import { reducer as DriveReducer } from "../src/reducers/drive.js";
import { reducer as NodeReducer } from "../src/reducers/node.js";

const stateReducer: ImmutableStateReducer<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> = (state, action, dispatch) => {
  if (utils.isBaseAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_FILE":
      AddFileInputSchema().parse(action.input);
      NodeReducer.addFileOperation(state[action.scope], action, dispatch);
      break;

    case "ADD_FOLDER":
      AddFolderInputSchema().parse(action.input);
      NodeReducer.addFolderOperation(state[action.scope], action, dispatch);
      break;

    case "DELETE_NODE":
      DeleteNodeInputSchema().parse(action.input);
      NodeReducer.deleteNodeOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_FILE":
      UpdateFileInputSchema().parse(action.input);
      NodeReducer.updateFileOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_NODE":
      UpdateNodeInputSchema().parse(action.input);
      NodeReducer.updateNodeOperation(state[action.scope], action, dispatch);
      break;

    case "COPY_NODE":
      CopyNodeInputSchema().parse(action.input);
      NodeReducer.copyNodeOperation(state[action.scope], action, dispatch);
      break;

    case "MOVE_NODE":
      MoveNodeInputSchema().parse(action.input);
      NodeReducer.moveNodeOperation(state[action.scope], action, dispatch);
      break;

    case "SET_DRIVE_NAME":
      SetDriveNameInputSchema().parse(action.input);
      DriveReducer.setDriveNameOperation(state[action.scope], action, dispatch);
      break;

    case "SET_DRIVE_ICON":
      SetDriveIconInputSchema().parse(action.input);
      DriveReducer.setDriveIconOperation(state[action.scope], action, dispatch);
      break;

    case "SET_SHARING_TYPE":
      SetSharingTypeInputSchema().parse(action.input);
      DriveReducer.setSharingTypeOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      SetAvailableOfflineInputSchema().parse(action.input);
      DriveReducer.setAvailableOfflineOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      AddListenerInputSchema().parse(action.input);
      DriveReducer.addListenerOperation(state[action.scope], action, dispatch);
      break;

    case "REMOVE_LISTENER":
      RemoveListenerInputSchema().parse(action.input);
      DriveReducer.removeListenerOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      AddTriggerInputSchema().parse(action.input);
      DriveReducer.addTriggerOperation(state[action.scope], action, dispatch);
      break;

    case "REMOVE_TRIGGER":
      RemoveTriggerInputSchema().parse(action.input);
      DriveReducer.removeTriggerOperation(
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
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>(stateReducer);
