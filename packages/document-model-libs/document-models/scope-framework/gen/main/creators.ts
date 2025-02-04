import { utils } from "document-model/document";
import {
  z,
  SetRootPathInput,
  AddElementInput,
  UpdateElementTypeInput,
  UpdateElementNameInput,
  UpdateElementComponentsInput,
  RemoveElementInput,
  ReorderElementsInput,
  MoveElementInput,
} from "../types";
import {
  SetRootPathAction,
  AddElementAction,
  UpdateElementTypeAction,
  UpdateElementNameAction,
  UpdateElementComponentsAction,
  RemoveElementAction,
  ReorderElementsAction,
  MoveElementAction,
} from "./actions";

const { createAction } = utils;

export const setRootPath = (input: SetRootPathInput) =>
  createAction<SetRootPathAction>(
    "SET_ROOT_PATH",
    { ...input },
    undefined,
    z.SetRootPathInputSchema,
    "global",
  );

export const addElement = (input: AddElementInput) =>
  createAction<AddElementAction>(
    "ADD_ELEMENT",
    { ...input },
    undefined,
    z.AddElementInputSchema,
    "global",
  );

export const updateElementType = (input: UpdateElementTypeInput) =>
  createAction<UpdateElementTypeAction>(
    "UPDATE_ELEMENT_TYPE",
    { ...input },
    undefined,
    z.UpdateElementTypeInputSchema,
    "global",
  );

export const updateElementName = (input: UpdateElementNameInput) =>
  createAction<UpdateElementNameAction>(
    "UPDATE_ELEMENT_NAME",
    { ...input },
    undefined,
    z.UpdateElementNameInputSchema,
    "global",
  );

export const updateElementComponents = (input: UpdateElementComponentsInput) =>
  createAction<UpdateElementComponentsAction>(
    "UPDATE_ELEMENT_COMPONENTS",
    { ...input },
    undefined,
    z.UpdateElementComponentsInputSchema,
    "global",
  );

export const removeElement = (input: RemoveElementInput) =>
  createAction<RemoveElementAction>(
    "REMOVE_ELEMENT",
    { ...input },
    undefined,
    z.RemoveElementInputSchema,
    "global",
  );

export const reorderElements = (input: ReorderElementsInput) =>
  createAction<ReorderElementsAction>(
    "REORDER_ELEMENTS",
    { ...input },
    undefined,
    z.ReorderElementsInputSchema,
    "global",
  );

export const moveElement = (input: MoveElementInput) =>
  createAction<MoveElementAction>(
    "MOVE_ELEMENT",
    { ...input },
    undefined,
    z.MoveElementInputSchema,
    "global",
  );
