import { BaseDocument } from "@document/object.js";

import {

  DocumentModelState,
  DocumentModelLocalState,
} from "../types.js";
import {
  addOperationExample,
  updateOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
} from "./creators.js";
import { DocumentModelAction } from "../actions.js";
import { ReducerOptions } from "@document/types.js";
import { AddOperationExampleInput, UpdateOperationExampleInput, DeleteOperationExampleInput, ReorderOperationExamplesInput } from "../schema/types.js";

export default class DocumentModel_OperationExample extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> {
  public addOperationExample(
    input: AddOperationExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(addOperationExample(input), options);
  }

  public updateOperationExample(
    input: UpdateOperationExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(updateOperationExample(input), options);
  }

  public deleteOperationExample(
    input: DeleteOperationExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(deleteOperationExample(input), options);
  }

  public reorderOperationExamples(
    input: ReorderOperationExamplesInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(reorderOperationExamples(input), options);
  }
}
