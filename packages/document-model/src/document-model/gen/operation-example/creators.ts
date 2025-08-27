import { createAction } from "document-model";
import type {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "../schema/index.js";
import { z } from "../schema/index.js";
import type {
  AddOperationExampleAction,
  DeleteOperationExampleAction,
  ReorderOperationExamplesAction,
  UpdateOperationExampleAction,
} from "./actions.js";

export const addOperationExample = (input: AddOperationExampleInput) =>
  createAction<AddOperationExampleAction>(
    "ADD_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    z.AddOperationExampleInputSchema,
    "global",
  );

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
  createAction<UpdateOperationExampleAction>(
    "UPDATE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    z.UpdateOperationExampleInputSchema,
    "global",
  );

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
  createAction<DeleteOperationExampleAction>(
    "DELETE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    z.DeleteOperationExampleInputSchema,
    "global",
  );

export const reorderOperationExamples = (
  input: ReorderOperationExamplesInput,
) =>
  createAction<ReorderOperationExamplesAction>(
    "REORDER_OPERATION_EXAMPLES",
    { ...input },
    undefined,
    z.ReorderOperationExamplesInputSchema,
    "global",
  );
