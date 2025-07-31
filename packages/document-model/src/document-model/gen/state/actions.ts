import { BaseAction } from "../../../document/types.js";
import {
  AddStateExampleInput,
  DeleteStateExampleInput,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "../schema/types.js";

export type SetStateSchemaAction = BaseAction<SetStateSchemaInput> & {
  type: "SET_STATE_SCHEMA";
};
export type SetInitialStateAction = BaseAction<SetInitialStateInput> & {
  type: "SET_INITIAL_STATE";
};
export type AddStateExampleAction = BaseAction<AddStateExampleInput> & {
  type: "ADD_STATE_EXAMPLE";
};
export type UpdateStateExampleAction = BaseAction<UpdateStateExampleInput> & {
  type: "UPDATE_STATE_EXAMPLE";
};
export type DeleteStateExampleAction = BaseAction<DeleteStateExampleInput> & {
  type: "DELETE_STATE_EXAMPLE";
};
export type ReorderStateExamplesAction = BaseAction<ReorderStateExamplesInput> & {
  type: "REORDER_STATE_EXAMPLES";
};

export type DocumentModelStateAction =
  | SetStateSchemaAction
  | SetInitialStateAction
  | AddStateExampleAction
  | UpdateStateExampleAction
  | DeleteStateExampleAction
  | ReorderStateExamplesAction;
