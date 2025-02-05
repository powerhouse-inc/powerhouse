import {
    SetRootPathInput,
    AddElementInput,
    UpdateElementTypeInput,
    UpdateElementNameInput,
    UpdateElementComponentsInput,
    RemoveElementInput,
    ReorderElementsInput,
    MoveElementInput
} from "../types.js";
import {
    SetRootPathAction,
    AddElementAction,
    UpdateElementTypeAction,
    UpdateElementNameAction,
    UpdateElementComponentsAction,
    RemoveElementAction,
    ReorderElementsAction,
    MoveElementAction,
} from "./actions.js";



export const setRootPath = (input: SetRootPathInput) =>
  createAction<SetRootPathAction>(
    "SET_ROOT_PATH",
    { ...input },
    undefined,
    SetRootPathInputSchema,
    "global",
  );

export const addElement = (input: AddElementInput) =>
  createAction<AddElementAction>(
    "ADD_ELEMENT",
    { ...input },
    undefined,
    AddElementInputSchema,
    "global",
  );

export const updateElementType = (input: UpdateElementTypeInput) =>
  createAction<UpdateElementTypeAction>(
    "UPDATE_ELEMENT_TYPE",
    { ...input },
    undefined,
    UpdateElementTypeInputSchema,
    "global",
  );

export const updateElementName = (input: UpdateElementNameInput) =>
  createAction<UpdateElementNameAction>(
    "UPDATE_ELEMENT_NAME",
    { ...input },
    undefined,
    UpdateElementNameInputSchema,
    "global",
  );

export const updateElementComponents = (input: UpdateElementComponentsInput) =>
  createAction<UpdateElementComponentsAction>(
    "UPDATE_ELEMENT_COMPONENTS",
    { ...input },
    undefined,
    UpdateElementComponentsInputSchema,
    "global",
  );

export const removeElement = (input: RemoveElementInput) =>
  createAction<RemoveElementAction>(
    "REMOVE_ELEMENT",
    { ...input },
    undefined,
    RemoveElementInputSchema,
    "global",
  );

export const reorderElements = (input: ReorderElementsInput) =>
  createAction<ReorderElementsAction>(
    "REORDER_ELEMENTS",
    { ...input },
    undefined,
    ReorderElementsInputSchema,
    "global",
  );

export const moveElement = (input: MoveElementInput) =>
  createAction<MoveElementAction>(
    "MOVE_ELEMENT",
    { ...input },
    undefined,
    MoveElementInputSchema,
    "global",
  );
