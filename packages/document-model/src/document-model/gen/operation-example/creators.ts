import type {
  AddOperationExampleAction,
  AddOperationExampleInput,
  DeleteOperationExampleAction,
  DeleteOperationExampleInput,
  ReorderOperationExamplesAction,
  ReorderOperationExamplesInput,
  UpdateOperationExampleAction,
  UpdateOperationExampleInput,
} from "document-model";
import {
  AddOperationExampleInputSchema,
  createAction,
  DeleteOperationExampleInputSchema,
  ReorderOperationExamplesInputSchema,
  UpdateOperationExampleInputSchema,
} from "document-model";

export const addOperationExample = (input: AddOperationExampleInput) =>
  createAction<AddOperationExampleAction>(
    "ADD_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    AddOperationExampleInputSchema,
    "global",
  );

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
  createAction<UpdateOperationExampleAction>(
    "UPDATE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    UpdateOperationExampleInputSchema,
    "global",
  );

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
  createAction<DeleteOperationExampleAction>(
    "DELETE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    DeleteOperationExampleInputSchema,
    "global",
  );

export const reorderOperationExamples = (
  input: ReorderOperationExamplesInput,
) =>
  createAction<ReorderOperationExamplesAction>(
    "REORDER_OPERATION_EXAMPLES",
    { ...input },
    undefined,
    ReorderOperationExamplesInputSchema,
    "global",
  );
