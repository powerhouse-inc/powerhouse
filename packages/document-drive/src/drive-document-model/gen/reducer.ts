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


  const typedAction = action as any;
  switch (typedAction.type) {
    case "ADD_FILE":
      z.AddFileInputSchema().parse(typedAction.input);
      NodeReducer.addFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_FOLDER":
      z.AddFolderInputSchema().parse(typedAction.input);
      NodeReducer.addFolderOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "DELETE_NODE":
      z.DeleteNodeInputSchema().parse(typedAction.input);
      NodeReducer.deleteNodeOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "UPDATE_FILE":
      z.UpdateFileInputSchema().parse(typedAction.input);
      NodeReducer.updateFileOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "UPDATE_NODE":
      z.UpdateNodeInputSchema().parse(typedAction.input);
      NodeReducer.updateNodeOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "COPY_NODE":
      z.CopyNodeInputSchema().parse(typedAction.input);
      NodeReducer.copyNodeOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "MOVE_NODE":
      z.MoveNodeInputSchema().parse(typedAction.input);
      NodeReducer.moveNodeOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "SET_DRIVE_NAME":
      z.SetDriveNameInputSchema().parse(typedAction.input);
      DriveReducer.setDriveNameOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "SET_DRIVE_ICON":
      z.SetDriveIconInputSchema().parse(typedAction.input);
      DriveReducer.setDriveIconOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "SET_SHARING_TYPE":
      z.SetSharingTypeInputSchema().parse(typedAction.input);
      DriveReducer.setSharingTypeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      z.SetAvailableOfflineInputSchema().parse(typedAction.input);
      DriveReducer.setAvailableOfflineOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      z.AddListenerInputSchema().parse(typedAction.input);
      DriveReducer.addListenerOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "REMOVE_LISTENER":
      z.RemoveListenerInputSchema().parse(typedAction.input);
      DriveReducer.removeListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      z.AddTriggerInputSchema().parse(typedAction.input);
      DriveReducer.addTriggerOperation((state as any)[typedAction.scope], action as any, dispatch);
      break;

    case "REMOVE_TRIGGER":
      z.RemoveTriggerInputSchema().parse(typedAction.input);
      DriveReducer.removeTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const reducer: Reducer<DocumentDriveDocument> =
  createReducer<DocumentDriveDocument>(stateReducer);
