import { BaseDocument } from "@document/object.js";

import {
    SetStateSchemaInput,
    SetInitialStateInput,
    AddStateExampleInput,
    UpdateStateExampleInput,
    DeleteStateExampleInput,
    ReorderStateExamplesInput,
    DocumentModelState,
    DocumentModelLocalState,
} from "../schema/types.js";
import {
    setStateSchema,
    setInitialState,
    addStateExample,
    updateStateExample,
    deleteStateExample,
    reorderStateExamples,
} from "./creators.js";
import { DocumentModelAction } from "../actions.js";
import { ReducerOptions } from "@document/types.js";

export default class DocumentModel_State extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
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
