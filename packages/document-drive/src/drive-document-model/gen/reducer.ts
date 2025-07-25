import {
  type StateReducer,
  createReducer,
  isDocumentAction,
  Reducer,
} from "document-model";
import { type DocumentDriveDocument, z } from "./types.js";

import { reducer as DriveReducer } from "../src/reducers/drive.js";
import { reducer as NodeReducer } from "../src/reducers/node.js";

const stateReducer: StateReducer<DocumentDriveDocument> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "ADD_FILE":
      z.AddFileInputSchema().parse(action.input);
      NodeReducer.addFileOperation(state[action.scope], action, dispatch);
      break;

    case "ADD_FOLDER":
      z.AddFolderInputSchema().parse(action.input);
      NodeReducer.addFolderOperation(state[action.scope], action, dispatch);
      break;

    case "DELETE_NODE":
      z.DeleteNodeInputSchema().parse(action.input);
      NodeReducer.deleteNodeOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_FILE":
      z.UpdateFileInputSchema().parse(action.input);
      NodeReducer.updateFileOperation(state[action.scope], action, dispatch);
      break;

    case "UPDATE_NODE":
      z.UpdateNodeInputSchema().parse(action.input);
      NodeReducer.updateNodeOperation(state[action.scope], action, dispatch);
      break;

    case "COPY_NODE":
      z.CopyNodeInputSchema().parse(action.input);
      NodeReducer.copyNodeOperation(state[action.scope], action, dispatch);
      break;

    case "MOVE_NODE":
      z.MoveNodeInputSchema().parse(action.input);
      NodeReducer.moveNodeOperation(state[action.scope], action, dispatch);
      break;

    case "SET_DRIVE_NAME":
      z.SetDriveNameInputSchema().parse(action.input);
      DriveReducer.setDriveNameOperation(state[action.scope], action, dispatch);
      break;

    case "SET_DRIVE_ICON":
      z.SetDriveIconInputSchema().parse(action.input);
      DriveReducer.setDriveIconOperation(state[action.scope], action, dispatch);
      break;

    case "SET_SHARING_TYPE":
      z.SetSharingTypeInputSchema().parse(action.input);
      DriveReducer.setSharingTypeOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      z.SetAvailableOfflineInputSchema().parse(action.input);
      DriveReducer.setAvailableOfflineOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      z.AddListenerInputSchema().parse(action.input);
      DriveReducer.addListenerOperation(state[action.scope], action, dispatch);
      break;

    case "REMOVE_LISTENER":
      z.RemoveListenerInputSchema().parse(action.input);
      DriveReducer.removeListenerOperation(
        state[action.scope],
        action,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      z.AddTriggerInputSchema().parse(action.input);
      DriveReducer.addTriggerOperation(state[action.scope], action, dispatch);
      break;

    case "REMOVE_TRIGGER":
      z.RemoveTriggerInputSchema().parse(action.input);
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

export const reducer: Reducer<DocumentDriveDocument> =
  createReducer<DocumentDriveDocument>(stateReducer);

