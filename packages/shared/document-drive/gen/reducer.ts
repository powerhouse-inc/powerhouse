import { isDocumentAction } from "../../document-model/documents.js";
import { createReducer } from "../../document-model/reducer.js";
import type { Reducer, StateReducer } from "../../document-model/types.js";
import { driveReducer } from "../src/reducers/drive.js";
import { nodeReducer } from "../src/reducers/node.js";
import {
  AddFileInputSchema,
  AddFolderInputSchema,
  AddListenerInputSchema,
  AddTriggerInputSchema,
  CopyNodeInputSchema,
  DeleteNodeInputSchema,
  MoveNodeInputSchema,
  RemoveListenerInputSchema,
  RemoveTriggerInputSchema,
  SetAvailableOfflineInputSchema,
  SetDriveIconInputSchema,
  SetDriveNameInputSchema,
  SetSharingTypeInputSchema,
  UpdateFileInputSchema,
  UpdateNodeInputSchema,
} from "./schema/zod.js";
import type { DocumentDrivePHState } from "./types.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const driveStateReducer: StateReducer<DocumentDrivePHState> = (
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
      memoizedSchema(AddFileInputSchema).parse(typedAction.input);
      nodeReducer.addFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_FOLDER":
      memoizedSchema(AddFolderInputSchema).parse(typedAction.input);
      nodeReducer.addFolderOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "DELETE_NODE":
      memoizedSchema(DeleteNodeInputSchema).parse(typedAction.input);
      nodeReducer.deleteNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_FILE":
      memoizedSchema(UpdateFileInputSchema).parse(typedAction.input);
      nodeReducer.updateFileOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "UPDATE_NODE":
      memoizedSchema(UpdateNodeInputSchema).parse(typedAction.input);
      nodeReducer.updateNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "COPY_NODE":
      memoizedSchema(CopyNodeInputSchema).parse(typedAction.input);
      nodeReducer.copyNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "MOVE_NODE":
      memoizedSchema(MoveNodeInputSchema).parse(typedAction.input);
      nodeReducer.moveNodeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_NAME":
      memoizedSchema(SetDriveNameInputSchema).parse(typedAction.input);
      driveReducer.setDriveNameOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_DRIVE_ICON":
      memoizedSchema(SetDriveIconInputSchema).parse(typedAction.input);
      driveReducer.setDriveIconOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_SHARING_TYPE":
      memoizedSchema(SetSharingTypeInputSchema).parse(typedAction.input);
      driveReducer.setSharingTypeOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "SET_AVAILABLE_OFFLINE":
      memoizedSchema(SetAvailableOfflineInputSchema).parse(typedAction.input);
      driveReducer.setAvailableOfflineOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_LISTENER":
      memoizedSchema(AddListenerInputSchema).parse(typedAction.input);
      driveReducer.addListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_LISTENER":
      memoizedSchema(RemoveListenerInputSchema).parse(typedAction.input);
      driveReducer.removeListenerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "ADD_TRIGGER":
      memoizedSchema(AddTriggerInputSchema).parse(typedAction.input);
      driveReducer.addTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    case "REMOVE_TRIGGER":
      memoizedSchema(RemoveTriggerInputSchema).parse(typedAction.input);
      driveReducer.removeTriggerOperation(
        (state as any)[typedAction.scope],
        action as any,
        dispatch,
      );
      break;

    default:
      return state;
  }
};

export const driveDocumentReducer: Reducer<DocumentDrivePHState> =
  createReducer<DocumentDrivePHState>(driveStateReducer);
