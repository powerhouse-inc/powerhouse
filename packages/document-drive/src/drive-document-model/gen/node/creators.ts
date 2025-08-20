import { createAction } from "document-model";
import {
  z,
  type AddFileInput,
  type AddFolderInput,
  type DeleteNodeInput,
  type UpdateFileInput,
  type UpdateNodeInput,
  type CopyNodeInput,
  type MoveNodeInput,
  type LegacyAddFileInput,
  type LegacyAddFileAction,
} from "../types.js";
import {
  type AddFileAction,
  type AddFolderAction,
  type DeleteNodeAction,
  type UpdateFileAction,
  type UpdateNodeAction,
  type CopyNodeAction,
  type MoveNodeAction,
} from "./actions.js";

/**
 * @deprecated Use addFile with {@link AddFileInput} instead. This overload will be removed in the future.
 */
export function addFile(input: LegacyAddFileInput): LegacyAddFileAction;
export function addFile(input: AddFileInput): AddFileAction;
export function addFile(
  input: LegacyAddFileInput | AddFileInput,
): typeof input extends LegacyAddFileInput
  ? LegacyAddFileAction
  : AddFileAction {
  if (input && typeof input === "object" && "synchronizationUnits" in input) {
    // Legacy overload
    return createAction<AddFileAction>(
      "ADD_FILE",
      { ...input },
      undefined,
      undefined,
      "global",
    );
  }
  // Standard overload
  return createAction<AddFileAction>(
    "ADD_FILE",
    { ...input },
    undefined,
    z.AddFileInputSchema,
    "global",
  );
}

export const addFolder = (input: AddFolderInput) =>
  createAction<AddFolderAction>(
    "ADD_FOLDER",
    { ...input },
    undefined,
    z.AddFolderInputSchema,
    "global",
  );

export const deleteNode = (input: DeleteNodeInput) =>
  createAction<DeleteNodeAction>(
    "DELETE_NODE",
    { ...input },
    undefined,
    z.DeleteNodeInputSchema,
    "global",
  );

export const updateFile = (input: UpdateFileInput) =>
  createAction<UpdateFileAction>(
    "UPDATE_FILE",
    { ...input },
    undefined,
    z.UpdateFileInputSchema,
    "global",
  );

export const updateNode = (input: UpdateNodeInput) =>
  createAction<UpdateNodeAction>(
    "UPDATE_NODE",
    { ...input },
    undefined,
    z.UpdateNodeInputSchema,
    "global",
  );

export const copyNode = (input: CopyNodeInput) =>
  createAction<CopyNodeAction>(
    "COPY_NODE",
    { ...input },
    undefined,
    z.CopyNodeInputSchema,
    "global",
  );

export const moveNode = (input: MoveNodeInput) =>
  createAction<MoveNodeAction>(
    "MOVE_NODE",
    { ...input },
    undefined,
    z.MoveNodeInputSchema,
    "global",
  );
