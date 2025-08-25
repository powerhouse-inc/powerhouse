import { BaseDocumentClass } from "../../../document/object.js";
import { type ReducerOptions } from "../../../document/types.js";
import { type DocumentModelAction } from "../actions.js";
import {
  type AddOperationErrorInput,
  type DeleteOperationErrorInput,
  type DocumentModelLocalState,
  type ReorderOperationErrorsInput,
  type SetOperationErrorCodeInput,
  type SetOperationErrorDescriptionInput,
  type SetOperationErrorNameInput,
  type SetOperationErrorTemplateInput,
} from "../schema/types.js";
import { type DocumentModelState } from "../types.js";
import {
  addOperationError,
  deleteOperationError,
  reorderOperationErrors,
  setOperationErrorCode,
  setOperationErrorDescription,
  setOperationErrorName,
  setOperationErrorTemplate,
} from "./creators.js";

export default class DocumentModel_OperationError extends BaseDocumentClass<
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
