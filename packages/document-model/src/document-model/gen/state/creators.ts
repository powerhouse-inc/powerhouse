import { createAction } from "../../../document/utils/base.js";
import {
  z,
  type AddStateExampleInput,
  type DeleteStateExampleInput,
  type ReorderStateExamplesInput,
  type SetInitialStateInput,
  type SetStateSchemaInput,
  type UpdateStateExampleInput,
} from "../schema/index.js";
import {
  AddStateExampleAction,
  DeleteStateExampleAction,
  ReorderStateExamplesAction,
  SetInitialStateAction,
  SetStateSchemaAction,
  UpdateStateExampleAction,
} from "./actions.js";

export const setStateSchema = (input: SetStateSchemaInput) =>
  createAction<SetStateSchemaAction>(
    "SET_STATE_SCHEMA",
    { ...input },
    undefined,
    z.SetStateSchemaInputSchema,
    "global",
  );

export const setInitialState = (input: SetInitialStateInput) =>
  createAction<SetInitialStateAction>(
    "SET_INITIAL_STATE",
    { ...input },
    undefined,
    z.SetInitialStateInputSchema,
    "global",
  );

export const addStateExample = (input: AddStateExampleInput) =>
  createAction<AddStateExampleAction>(
    "ADD_STATE_EXAMPLE",
    { ...input },
    undefined,
    z.AddStateExampleInputSchema,
    "global",
  );

export const updateStateExample = (input: UpdateStateExampleInput) =>
  createAction<UpdateStateExampleAction>(
    "UPDATE_STATE_EXAMPLE",
    { ...input },
    undefined,
    z.UpdateStateExampleInputSchema,
    "global",
  );

export const deleteStateExample = (input: DeleteStateExampleInput) =>
  createAction<DeleteStateExampleAction>(
    "DELETE_STATE_EXAMPLE",
    { ...input },
    undefined,
    z.DeleteStateExampleInputSchema,
    "global",
  );

export const reorderStateExamples = (input: ReorderStateExamplesInput) =>
  createAction<ReorderStateExamplesAction>(
    "REORDER_STATE_EXAMPLES",
    { ...input },
    undefined,
    z.ReorderStateExamplesInputSchema,
    "global",
  );
