import {
    AddFileInput,
    AddFolderInput,
    DeleteNodeInput,
    UpdateFileInput,
    UpdateNodeInput,
    CopyNodeInput,
    MoveNodeInput,
} from "../types.js";

export type AddFileAction = BaseAction<"ADD_FILE", AddFileInput, "global">;
export type AddFolderAction = BaseAction<"ADD_FOLDER", AddFolderInput, "global">;
export type DeleteNodeAction = BaseAction<"DELETE_NODE", DeleteNodeInput, "global">;
export type UpdateFileAction = BaseAction<"UPDATE_FILE", UpdateFileInput, "global">;
export type UpdateNodeAction = BaseAction<"UPDATE_NODE", UpdateNodeInput, "global">;
export type CopyNodeAction = BaseAction<"COPY_NODE", CopyNodeInput, "global">;
export type MoveNodeAction = BaseAction<"MOVE_NODE", MoveNodeInput, "global">;

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;
