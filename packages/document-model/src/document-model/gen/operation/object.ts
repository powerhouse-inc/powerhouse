import type {
  AbstractConstructor,
  Action,
  AddOperationInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteOperationInput,
  MoveOperationInput,
  ReducerOptions,
  ReorderModuleOperationsInput,
  SetOperationDescriptionInput,
  SetOperationNameInput,
  SetOperationReducerInput,
  SetOperationSchemaInput,
  SetOperationScopeInput,
  SetOperationTemplateInput,
} from "document-model";
import {
  addOperation,
  deleteOperation,
  moveOperation,
  reorderModuleOperations,
  setOperationDescription,
  setOperationName,
  setOperationReducer,
  setOperationSchema,
  setOperationScope,
  setOperationTemplate,
} from "document-model";

export interface DocumentModel_Operation_Augment<TAction extends Action> {
  addOperation(input: AddOperationInput, options?: ReducerOptions): this;
  setOperationName(
    input: SetOperationNameInput,
    options?: ReducerOptions,
  ): this;
  setOperationScope(
    input: SetOperationScopeInput,
    options?: ReducerOptions,
  ): this;
  setOperationSchema(
    input: SetOperationSchemaInput,
    options?: ReducerOptions,
  ): this;
  setOperationDescription(
    input: SetOperationDescriptionInput,
    options?: ReducerOptions,
  ): this;
  setOperationTemplate(
    input: SetOperationTemplateInput,
    options?: ReducerOptions,
  ): this;
  setOperationReducer(
    input: SetOperationReducerInput,
    options?: ReducerOptions,
  ): this;
  moveOperation(input: MoveOperationInput, options?: ReducerOptions): this;
  deleteOperation(input: DeleteOperationInput, options?: ReducerOptions): this;
  reorderModuleOperations(
    input: ReorderModuleOperationsInput,
    options?: ReducerOptions,
  ): this;
}

export function DocumentModel_Operation<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_Operation_Augment<TAction>> {
  abstract class DocumentModel_OperationClass extends Base {
    public addOperation(input: AddOperationInput, options?: ReducerOptions) {
      return this.dispatch(addOperation(input) as TAction, options);
    }
    public setOperationName(
      input: SetOperationNameInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationName(input) as TAction, options);
    }
    public setOperationScope(
      input: SetOperationScopeInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationScope(input) as TAction, options);
    }
    public setOperationSchema(
      input: SetOperationSchemaInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationSchema(input) as TAction, options);
    }
    public setOperationDescription(
      input: SetOperationDescriptionInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationDescription(input) as TAction, options);
    }
    public setOperationTemplate(
      input: SetOperationTemplateInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationTemplate(input) as TAction, options);
    }
    public setOperationReducer(
      input: SetOperationReducerInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setOperationReducer(input) as TAction, options);
    }
    public moveOperation(input: MoveOperationInput, options?: ReducerOptions) {
      return this.dispatch(moveOperation(input) as TAction, options);
    }
    public deleteOperation(
      input: DeleteOperationInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(deleteOperation(input) as TAction, options);
    }
    public reorderModuleOperations(
      input: ReorderModuleOperationsInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderModuleOperations(input) as TAction, options);
    }
  }
  return DocumentModel_OperationClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_Operation_Augment<TAction>
  >;
}
