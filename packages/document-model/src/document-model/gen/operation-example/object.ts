import type {
  AbstractConstructor,
  Action,
  AddOperationExampleInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteOperationExampleInput,
  ReducerOptions,
  ReorderOperationExamplesInput,
  UpdateOperationExampleInput,
} from "document-model";
import {
  addOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
  updateOperationExample,
} from "document-model";

export interface DocumentModel_OperationExample_Augment<
  TAction extends Action,
> {
  addOperationExample(
    input: AddOperationExampleInput,
    options?: ReducerOptions,
  ): this;
  updateOperationExample(
    input: UpdateOperationExampleInput,
    options?: ReducerOptions,
  ): this;
  deleteOperationExample(
    input: DeleteOperationExampleInput,
    options?: ReducerOptions,
  ): this;
  reorderOperationExamples(
    input: ReorderOperationExamplesInput,
    options?: ReducerOptions,
  ): this;
}

export function DocumentModel_OperationExample<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_OperationExample_Augment<TAction>> {
  abstract class DocumentModel_OperationExampleClass extends Base {
    public addOperationExample(
      input: AddOperationExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(addOperationExample(input) as TAction, options);
    }
    public updateOperationExample(
      input: UpdateOperationExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(updateOperationExample(input) as TAction, options);
    }
    public deleteOperationExample(
      input: DeleteOperationExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(deleteOperationExample(input) as TAction, options);
    }
    public reorderOperationExamples(
      input: ReorderOperationExamplesInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderOperationExamples(input) as TAction, options);
    }
  }
  return DocumentModel_OperationExampleClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_OperationExample_Augment<TAction>
  >;
}
