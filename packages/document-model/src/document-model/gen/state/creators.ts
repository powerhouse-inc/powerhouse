import { createAction } from "#document/utils/base.js";
import {
  AddStateExampleInput,
  DeleteStateExampleInput,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "../schema/types.js";
import {
  AddStateExampleAction,
  DeleteStateExampleAction,
  ReorderStateExamplesAction,
  SetInitialStateAction,
  SetStateSchemaAction,
  UpdateStateExampleAction,
} from "./actions.js";

export const setStateSchema = (input: SetStateSchemaInput) =>
  createAction<SetStateSchemaAction>("SET_STATE_SCHEMA", { ...input });

export const setInitialState = (input: SetInitialStateInput) =>
  createAction<SetInitialStateAction>("SET_INITIAL_STATE", { ...input });

export const addStateExample = (input: AddStateExampleInput) =>
  createAction<AddStateExampleAction>("ADD_STATE_EXAMPLE", { ...input });

export const updateStateExample = (input: UpdateStateExampleInput) =>
  createAction<UpdateStateExampleAction>("UPDATE_STATE_EXAMPLE", { ...input });

export const deleteStateExample = (input: DeleteStateExampleInput) =>
  createAction<DeleteStateExampleAction>("DELETE_STATE_EXAMPLE", { ...input });

export const reorderStateExamples = (input: ReorderStateExamplesInput) =>
  createAction<ReorderStateExamplesAction>("REORDER_STATE_EXAMPLES", {
    ...input,
  });
