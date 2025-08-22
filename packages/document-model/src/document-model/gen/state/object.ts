import { BaseDocumentClass } from "../../../document/object.js";
import { ReducerOptions } from "../../../document/types.js";
import { DocumentModelPHState } from "../ph-factories.js";
import {
  AddStateExampleInput,
  DeleteStateExampleInput,
  ReorderStateExamplesInput,
  SetInitialStateInput,
  SetStateSchemaInput,
  UpdateStateExampleInput,
} from "../schema/types.js";
import {
  addStateExample,
  deleteStateExample,
  reorderStateExamples,
  setInitialState,
  setStateSchema,
  updateStateExample,
} from "./creators.js";

export default class DocumentModel_State extends BaseDocumentClass<DocumentModelPHState> {
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
