import type {
  AbstractConstructor,
  Action,
  AddOperationErrorInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteOperationErrorInput,
  ReducerOptions,
  ReorderOperationErrorsInput,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateInput,
} from "document-model";
import {
  addOperationError,
  deleteOperationError,
  reorderOperationErrors,
  setOperationErrorCode,
  setOperationErrorDescription,
  setOperationErrorName,
  setOperationErrorTemplate,
} from "document-model";

export interface DocumentModel_OperationError_Augment<TAction extends Action> {
  addOperationError(
    input: AddOperationErrorInput,
    options?: ReducerOptions,
  ): this;
  setOperationErrorCode(
    input: SetOperationErrorCodeInput,
    options?: ReducerOptions,
  ): this;
  setOperationErrorName(
    input: SetOperationErrorNameInput,
    options?: ReducerOptions,
  ): this;
  setOperationErrorDescription(
    input: SetOperationErrorDescriptionInput,
    options?: ReducerOptions,
  ): this;
  setOperationErrorTemplate(
    input: SetOperationErrorTemplateInput,
    options?: ReducerOptions,
  ): this;
  deleteOperationError(
    input: DeleteOperationErrorInput,
    options?: ReducerOptions,
  ): this;
  reorderOperationErrors(
    input: ReorderOperationErrorsInput,
    options?: ReducerOptions,
  ): this;
}

export function DocumentModel_OperationError<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_OperationError_Augment<TAction>> {
  abstract class DocumentModel_OperationErrorClass extends Base {
    public addOperationError(
      input: AddOperationErrorInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(addOperationError(input) as TAction, options);
    }
    public setOperationErrorCode(
      input: SetOperationErrorCodeInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationErrorCode(input) as TAction, options);
    }
    public setOperationErrorName(
      input: SetOperationErrorNameInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationErrorName(input) as TAction, options);
    }
    public setOperationErrorDescription(
      input: SetOperationErrorDescriptionInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(
        setOperationErrorDescription(input) as TAction,
        options,
      );
    }
    public setOperationErrorTemplate(
      input: SetOperationErrorTemplateInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(
        setOperationErrorTemplate(input) as TAction,
        options,
      );
    }
    public deleteOperationError(
      input: DeleteOperationErrorInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(deleteOperationError(input) as TAction, options);
    }
    public reorderOperationErrors(
      input: ReorderOperationErrorsInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderOperationErrors(input) as TAction, options);
    }
  }
  return DocumentModel_OperationErrorClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_OperationError_Augment<TAction>
  >;
}
