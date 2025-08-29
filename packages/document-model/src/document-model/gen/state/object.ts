import type {
  AddStateExampleInput,
  DeleteStateExampleInput,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  ReducerOptions,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "document-model";
import {
  addStateExample,
  BaseDocumentClass,
  deleteStateExample,
  reorderStateExamples,
  setInitialState,
  setStateSchema,
  updateStateExample,
} from "document-model";

export class DocumentModel_State extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  public setStateSchema(input: SetStateSchemaInput, options?: ReducerOptions) {
    return this.dispatch(setStateSchema(input), options);
  }

  public setInitialState(
    input: SetInitialStateInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setInitialState(input), options);
  }

  public addStateExample(
    input: AddStateExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(addStateExample(input), options);
  }

  public updateStateExample(
    input: UpdateStateExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(updateStateExample(input), options);
  }

  public deleteStateExample(
    input: DeleteStateExampleInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(deleteStateExample(input), options);
  }

  public reorderStateExamples(
    input: ReorderStateExamplesInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(reorderStateExamples(input), options);
  }
}
