import type {
  AbstractConstructor,
  Action,
  AugmentConstructor,
  BaseDocumentClass,
  ReducerOptions,
  SetAuthorNameInput,
  SetAuthorWebsiteInput,
  SetModelDescriptionInput,
  SetModelExtensionInput,
  SetModelIdInput,
  SetModelNameInput,
} from "document-model";
import {
  setAuthorName,
  setAuthorWebsite,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
} from "document-model";

// The interface of methods this mixin adds
export interface DocumentModel_Header_Augment<TAction extends Action> {
  setModelName(input: SetModelNameInput, options?: ReducerOptions): this;
  setModelId(input: SetModelIdInput, options?: ReducerOptions): this;
  setModelExtension(
    input: SetModelExtensionInput,
    options?: ReducerOptions,
  ): this;
  setModelDescription(
    input: SetModelDescriptionInput,
    options?: ReducerOptions,
  ): this;
  setAuthorName(input: SetAuthorNameInput, options?: ReducerOptions): this;
  setAuthorWebsite(
    input: SetAuthorWebsiteInput,
    options?: ReducerOptions,
  ): this;
}

export function DocumentModel_Header<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_Header_Augment<TAction>> {
  abstract class DocumentModel_HeaderClass extends Base {
    public setModelName(input: SetModelNameInput, options?: ReducerOptions) {
      return this.dispatch(setModelName(input) as TAction, options);
    }
    public setModelId(input: SetModelIdInput, options?: ReducerOptions) {
      return this.dispatch(setModelId(input) as TAction, options);
    }
    public setModelExtension(
      input: SetModelExtensionInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setModelExtension(input) as TAction, options);
    }
    public setModelDescription(
      input: SetModelDescriptionInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setModelDescription(input) as TAction, options);
    }
    public setAuthorName(input: SetAuthorNameInput, options?: ReducerOptions) {
      return this.dispatch(setAuthorName(input) as TAction, options);
    }
    public setAuthorWebsite(
      input: SetAuthorWebsiteInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setAuthorWebsite(input) as TAction, options);
    }
  }
  return DocumentModel_HeaderClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_Header_Augment<TAction>
  >;
}
