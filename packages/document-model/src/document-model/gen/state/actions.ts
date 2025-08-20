import { type Action, ActionWithAttachment } from "../../../document/types.js";
import {
  type AddStateExampleInput,
  type DeleteStateExampleInput,
  type ReorderStateExamplesInput,
  type SetInitialStateInput,
  type SetStateSchemaInput,
  type UpdateStateExampleInput,
} from "../schema/types.js";

export type SetStateSchemaAction = Action & {
  type: "SET_STATE_SCHEMA";
  input: SetStateSchemaInput;
};
export type SetInitialStateAction = Action & {
  type: "SET_INITIAL_STATE";
  input: SetInitialStateInput;
};
export type AddStateExampleAction = Action & {
  type: "ADD_STATE_EXAMPLE";
  input: AddStateExampleInput;
};
export type UpdateStateExampleAction = Action & {
  type: "UPDATE_STATE_EXAMPLE";
  input: UpdateStateExampleInput;
};
export type DeleteStateExampleAction = Action & {
  type: "DELETE_STATE_EXAMPLE";
  input: DeleteStateExampleInput;
};
export type ReorderStateExamplesAction = Action & {
  type: "REORDER_STATE_EXAMPLES";
  input: ReorderStateExamplesInput;
};

export type DocumentModelStateAction =
  | SetStateSchemaAction
  | SetInitialStateAction
  | AddStateExampleAction
  | UpdateStateExampleAction
  | DeleteStateExampleAction
  | ReorderStateExamplesAction;
