import { createAction } from "@document/utils/base.js";
import {
  AddOperationExampleAction,
  UpdateOperationExampleAction,
  DeleteOperationExampleAction,
  ReorderOperationExamplesAction,
} from "./actions.js";
import { AddOperationExampleInput, UpdateOperationExampleInput, DeleteOperationExampleInput, ReorderOperationExamplesInput } from "../schema/types.js";

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
