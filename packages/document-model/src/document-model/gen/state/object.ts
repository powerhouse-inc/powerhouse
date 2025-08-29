import type {
  AbstractConstructor,
  Action,
  AddStateExampleInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteStateExampleInput,
  ReducerOptions,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "document-model";
import {
  addStateExample,
  deleteStateExample,
  reorderStateExamples,
  setInitialState,
  setStateSchema,
  updateStateExample,
} from "document-model";

export interface DocumentModel_State_Augment<TAction extends Action> {
  setStateSchema(input: SetStateSchemaInput, options?: ReducerOptions): this;
  setInitialState(input: SetInitialStateInput, options?: ReducerOptions): this;
  addStateExample(input: AddStateExampleInput, options?: ReducerOptions): this;
  updateStateExample(
    input: UpdateStateExampleInput,
    options?: ReducerOptions,
  ): this;
  deleteStateExample(
    input: DeleteStateExampleInput,
    options?: ReducerOptions,
  ): this;
  reorderStateExamples(
    input: ReorderStateExamplesInput,
    options?: ReducerOptions,
  ): this;
}

export function DocumentModel_State<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_State_Augment<TAction>> {
  abstract class DocumentModel_StateClass extends Base {
    public setStateSchema(
      input: SetStateSchemaInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setStateSchema(input) as TAction, options);
    }
    public setInitialState(
      input: SetInitialStateInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setInitialState(input) as TAction, options);
    }
    public addStateExample(
      input: AddStateExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(addStateExample(input) as TAction, options);
    }
    public updateStateExample(
      input: UpdateStateExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(updateStateExample(input) as TAction, options);
    }
    public deleteStateExample(
      input: DeleteStateExampleInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(deleteStateExample(input) as TAction, options);
    }
    public reorderStateExamples(
      input: ReorderStateExamplesInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderStateExamples(input) as TAction, options);
    }
  }
  return DocumentModel_StateClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_State_Augment<TAction>
  >;
}
