import type {
  AddOperationExampleInput,
  DeleteOperationExampleInput,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  ReducerOptions,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "document-model";
import {
  addOperationExample,
  BaseDocumentClass,
  deleteOperationExample,
  reorderOperationExamples,
  updateOperationExample,
} from "document-model";

export class DocumentModel_OperationExample extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
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
