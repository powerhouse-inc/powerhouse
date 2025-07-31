import { BaseAction } from "../../../document/types.js";
import {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "../schema/types.js";

export type AddOperationExampleAction = BaseAction<AddOperationExampleInput> & {
  type: "ADD_OPERATION_EXAMPLE";
};
export type UpdateOperationExampleAction = BaseAction<UpdateOperationExampleInput> & {
  type: "UPDATE_OPERATION_EXAMPLE";
};
export type DeleteOperationExampleAction = BaseAction<DeleteOperationExampleInput> & {
  type: "DELETE_OPERATION_EXAMPLE";
};
export type ReorderOperationExamplesAction = BaseAction<ReorderOperationExamplesInput> & {
  type: "REORDER_OPERATION_EXAMPLES";
};

export type DocumentModelOperationExampleAction =
  | AddOperationExampleAction
  | UpdateOperationExampleAction
  | DeleteOperationExampleAction
  | ReorderOperationExamplesAction;
