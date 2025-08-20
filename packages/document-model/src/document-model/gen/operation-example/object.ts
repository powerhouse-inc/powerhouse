import { BaseDocumentClass } from "../../../document/object.js";
import { type ReducerOptions } from "../../../document/types.js";
import { type DocumentModelAction } from "../actions.js";
import {
  type AddOperationExampleInput,
  type DeleteOperationExampleInput,
  type ReorderOperationExamplesInput,
  type UpdateOperationExampleInput,
} from "../schema/types.js";
import {
  type DocumentModelLocalState,
  type DocumentModelState,
} from "../types.js";
import {
  addOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
  updateOperationExample,
} from "./creators.js";

export default class DocumentModel_OperationExample extends BaseDocumentClass<
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
