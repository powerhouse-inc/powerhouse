import { BaseDocumentClass } from "../../../document/object.js";
import type { ReducerOptions } from "../../../document/types.js";
import type { DocumentModelAction } from "../actions.js";
import type {
  AddOperationInput,
  DeleteOperationInput,
  DocumentModelState,
  MoveOperationInput,
  ReorderModuleOperationsInput,
  SetOperationDescriptionInput,
  SetOperationNameInput,
  SetOperationReducerInput,
  SetOperationSchemaInput,
  SetOperationScopeInput,
  SetOperationTemplateInput,
} from "../schema/types.js";
import type { DocumentModelLocalState } from "../types.js";
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
} from "./creators.js";

export default class DocumentModel_Operation extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
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
