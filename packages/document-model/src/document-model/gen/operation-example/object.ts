import { BaseDocument } from "../../../document/object";

import {
  AddOperationExampleInput,
  UpdateOperationExampleInput,
  DeleteOperationExampleInput,
  ReorderOperationExamplesInput,
  DocumentModelState,
  DocumentModelLocalState,
} from "../types";
import {
  addOperationExample,
  updateOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
} from "./creators";
import { DocumentModelAction } from "../actions";
import { ReducerOptions } from "../../../document";

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
