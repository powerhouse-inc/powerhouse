import { BaseDocument } from "../../../document/object";

import {
  AddOperationInput,
  SetOperationNameInput,
  SetOperationSchemaInput,
  SetOperationDescriptionInput,
  SetOperationTemplateInput,
  SetOperationReducerInput,
  MoveOperationInput,
  DeleteOperationInput,
  ReorderModuleOperationsInput,
  DocumentModelState,
  SetOperationScopeInput,
  DocumentModelLocalState,
} from "../types";
import {
  addOperation,
  setOperationName,
  setOperationSchema,
  setOperationDescription,
  setOperationTemplate,
  setOperationReducer,
  moveOperation,
  deleteOperation,
  reorderModuleOperations,
  setOperationScope,
} from "./creators";
import { DocumentModelAction } from "../actions";
import { ReducerOptions } from "../../../document";

export default class DocumentModel_Operation extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> {
  public addOperation(input: AddOperationInput, options?: ReducerOptions) {
    return this.dispatch(addOperation(input), options);
  }

  public setOperationName(
    input: SetOperationNameInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationName(input), options);
  }

  public setOperationScope(
    input: SetOperationScopeInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationScope(input), options);
  }

  public setOperationSchema(
    input: SetOperationSchemaInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationSchema(input), options);
  }

  public setOperationDescription(
    input: SetOperationDescriptionInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationDescription(input), options);
  }

  public setOperationTemplate(
    input: SetOperationTemplateInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationTemplate(input), options);
  }

  public setOperationReducer(
    input: SetOperationReducerInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setOperationReducer(input), options);
  }

  public moveOperation(input: MoveOperationInput, options?: ReducerOptions) {
    return this.dispatch(moveOperation(input), options);
  }

  public deleteOperation(
    input: DeleteOperationInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(deleteOperation(input), options);
  }

  public reorderModuleOperations(
    input: ReorderModuleOperationsInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(reorderModuleOperations(input), options);
  }
}
