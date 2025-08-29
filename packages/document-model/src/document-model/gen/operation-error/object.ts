import type {
  AddOperationErrorInput,
  DeleteOperationErrorInput,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  ReducerOptions,
  ReorderOperationErrorsInput,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateInput,
} from "document-model";
import { BaseDocumentClass } from "document-model";
import {
  addOperationError,
  deleteOperationError,
  reorderOperationErrors,
  setOperationErrorCode,
  setOperationErrorDescription,
  setOperationErrorName,
  setOperationErrorTemplate,
} from "document-model";

export class DocumentModel_OperationError extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  public addOperationError(
    input: AddOperationErrorInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(addOperationError(input), options);
  }

  public setOperationErrorCode(
    input: SetOperationErrorCodeInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationErrorCode(input), options);
  }

  public setOperationErrorName(
    input: SetOperationErrorNameInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationErrorName(input), options);
  }

  public setOperationErrorDescription(
    input: SetOperationErrorDescriptionInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationErrorDescription(input), options);
  }

  public setOperationErrorTemplate(
    input: SetOperationErrorTemplateInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationErrorTemplate(input), options);
  }

  public deleteOperationError(
    input: DeleteOperationErrorInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(deleteOperationError(input), options);
  }

  public reorderOperationErrors(
    input: ReorderOperationErrorsInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(reorderOperationErrors(input), options);
  }
}
