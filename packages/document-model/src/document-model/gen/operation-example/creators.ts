import { createAction } from "../../../document/utils/base.js";
import {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "../schema/types.js";
import {
  AddOperationExampleAction,
  DeleteOperationExampleAction,
  ReorderOperationExamplesAction,
  UpdateOperationExampleAction,
} from "./actions.js";

export const addOperationExample = (input: AddOperationExampleInput) =>
  createAction<AddOperationExampleAction>("ADD_OPERATION_EXAMPLE", {
    ...input,
  });

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
  createAction<UpdateOperationExampleAction>("UPDATE_OPERATION_EXAMPLE", {
    ...input,
  });

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
  createAction<DeleteOperationExampleAction>("DELETE_OPERATION_EXAMPLE", {
    ...input,
  });

export const reorderOperationExamples = (
  input: ReorderOperationExamplesInput,
) =>
  createAction<ReorderOperationExamplesAction>("REORDER_OPERATION_EXAMPLES", {
    ...input,
  });
