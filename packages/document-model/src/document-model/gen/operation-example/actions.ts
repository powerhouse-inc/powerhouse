import { BaseAction } from "../../../document/types.js";
import {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "../schema/types.js";

export type AddOperationExampleAction = BaseAction<
  "ADD_OPERATION_EXAMPLE",
  AddOperationExampleInput
>;
export type UpdateOperationExampleAction = BaseAction<
  "UPDATE_OPERATION_EXAMPLE",
  UpdateOperationExampleInput
>;
export type DeleteOperationExampleAction = BaseAction<
  "DELETE_OPERATION_EXAMPLE",
  DeleteOperationExampleInput
>;
export type ReorderOperationExamplesAction = BaseAction<
  "REORDER_OPERATION_EXAMPLES",
  ReorderOperationExamplesInput
>;

export type DocumentModelOperationExampleAction =
  | AddOperationExampleAction
  | UpdateOperationExampleAction
  | DeleteOperationExampleAction
  | ReorderOperationExamplesAction;
