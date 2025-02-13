import { BaseAction } from "../../../document/types.js";
import {
  AddStateExampleInput,
  DeleteStateExampleInput,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "../schema/types.js";

export type SetStateSchemaAction = BaseAction<
  "SET_STATE_SCHEMA",
  SetStateSchemaInput
>;
export type SetInitialStateAction = BaseAction<
  "SET_INITIAL_STATE",
  SetInitialStateInput
>;
export type AddStateExampleAction = BaseAction<
  "ADD_STATE_EXAMPLE",
  AddStateExampleInput
>;
export type UpdateStateExampleAction = BaseAction<
  "UPDATE_STATE_EXAMPLE",
  UpdateStateExampleInput
>;
export type DeleteStateExampleAction = BaseAction<
  "DELETE_STATE_EXAMPLE",
  DeleteStateExampleInput
>;
export type ReorderStateExamplesAction = BaseAction<
  "REORDER_STATE_EXAMPLES",
  ReorderStateExamplesInput
>;

export type DocumentModelStateAction =
  | SetStateSchemaAction
  | SetInitialStateAction
  | AddStateExampleAction
  | UpdateStateExampleAction
  | DeleteStateExampleAction
  | ReorderStateExamplesAction;
