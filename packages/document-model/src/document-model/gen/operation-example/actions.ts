import type { Action } from "../../../document/types.js";
import type {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "../schema/types.js";

export type AddOperationExampleAction = Action & {
  type: "ADD_OPERATION_EXAMPLE";
  input: AddOperationExampleInput;
};
export type UpdateOperationExampleAction = Action & {
  type: "UPDATE_OPERATION_EXAMPLE";
  input: UpdateOperationExampleInput;
};
export type DeleteOperationExampleAction = Action & {
  type: "DELETE_OPERATION_EXAMPLE";
  input: DeleteOperationExampleInput;
};
export type ReorderOperationExamplesAction = Action & {
  type: "REORDER_OPERATION_EXAMPLES";
  input: ReorderOperationExamplesInput;
};

export type DocumentModelOperationExampleAction =
  | AddOperationExampleAction
  | UpdateOperationExampleAction
  | DeleteOperationExampleAction
  | ReorderOperationExamplesAction;
