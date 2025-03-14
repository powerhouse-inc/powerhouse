import { createAction } from "document-model";
import { AddFileInputSchema, AddFolderInputSchema, CopyNodeInputSchema, DeleteNodeInputSchema, MoveNodeInputSchema, UpdateFileInputSchema, UpdateNodeInputSchema } from "../schema/zod.js";
import {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput
} from "../types.js";
import {
  AddFileAction,
  AddFolderAction,
  CopyNodeAction,
  DeleteNodeAction,
  MoveNodeAction,
  UpdateFileAction,
  UpdateNodeAction,
} from "./actions.js";



export const addFile = (input: AddFileInput) =>
  createAction<AddFileAction>(
    "ADD_FILE",
    { ...input },
    undefined,
    AddFileInputSchema,
    "global",
  );

export const addFolder = (input: AddFolderInput) =>
  createAction<AddFolderAction>(
    "ADD_FOLDER",
    { ...input },
    undefined,
    AddFolderInputSchema,
    "global",
  );

export const deleteNode = (input: DeleteNodeInput) =>
  createAction<DeleteNodeAction>(
    "DELETE_NODE",
    { ...input },
    undefined,
    DeleteNodeInputSchema,
    "global",
  );

export const updateFile = (input: UpdateFileInput) =>
  createAction<UpdateFileAction>(
    "UPDATE_FILE",
    { ...input },
    undefined,
    UpdateFileInputSchema,
    "global",
  );

export const updateNode = (input: UpdateNodeInput) =>
  createAction<UpdateNodeAction>(
    "UPDATE_NODE",
    { ...input },
    undefined,
    UpdateNodeInputSchema,
    "global",
  );

export const copyNode = (input: CopyNodeInput) =>
  createAction<CopyNodeAction>(
    "COPY_NODE",
    { ...input },
    undefined,
    CopyNodeInputSchema,
    "global",
  );

export const moveNode = (input: MoveNodeInput) =>
  createAction<MoveNodeAction>(
    "MOVE_NODE",
    { ...input },
    undefined,
    MoveNodeInputSchema,
    "global",
  );
