import type {
  AddStateExampleAction,
  AddStateExampleInput,
  DeleteStateExampleAction,
  DeleteStateExampleInput,
  ReorderStateExamplesAction,
  ReorderStateExamplesInput,
  SetInitialStateAction,
  SetInitialStateInput,
  SetStateSchemaAction,
  SetStateSchemaInput,
  UpdateStateExampleAction,
  UpdateStateExampleInput,
} from "document-model";
import {
  AddStateExampleInputSchema,
  createAction,
  DeleteStateExampleInputSchema,
  ReorderStateExamplesInputSchema,
  SetInitialStateInputSchema,
  SetStateSchemaInputSchema,
  UpdateStateExampleInputSchema,
} from "document-model";

export const setStateSchema = (input: SetStateSchemaInput) =>
  createAction<SetStateSchemaAction>(
    "SET_STATE_SCHEMA",
    { ...input },
    undefined,
    SetStateSchemaInputSchema,
    "global",
  );

export const setInitialState = (input: SetInitialStateInput) =>
  createAction<SetInitialStateAction>(
    "SET_INITIAL_STATE",
    { ...input },
    undefined,
    SetInitialStateInputSchema,
    "global",
  );

export const addStateExample = (input: AddStateExampleInput) =>
  createAction<AddStateExampleAction>(
    "ADD_STATE_EXAMPLE",
    { ...input },
    undefined,
    AddStateExampleInputSchema,
    "global",
  );

export const updateStateExample = (input: UpdateStateExampleInput) =>
  createAction<UpdateStateExampleAction>(
    "UPDATE_STATE_EXAMPLE",
    { ...input },
    undefined,
    UpdateStateExampleInputSchema,
    "global",
  );

export const deleteStateExample = (input: DeleteStateExampleInput) =>
  createAction<DeleteStateExampleAction>(
    "DELETE_STATE_EXAMPLE",
    { ...input },
    undefined,
    DeleteStateExampleInputSchema,
    "global",
  );

export const reorderStateExamples = (input: ReorderStateExamplesInput) =>
  createAction<ReorderStateExamplesAction>(
    "REORDER_STATE_EXAMPLES",
    { ...input },
    undefined,
    ReorderStateExamplesInputSchema,
    "global",
  );
