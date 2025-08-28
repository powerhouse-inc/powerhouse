import { BaseDocumentClass } from "document-model";
import type {
  SetProcessorNameInput,
  SetProcessorTypeInput,
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetProcessorStatusInput,
  ProcessorModuleState,
  ProcessorModuleLocalState,
} from "../types.js";
import {
  setProcessorName,
  setProcessorType,
  addDocumentType,
  removeDocumentType,
  setProcessorStatus,
} from "./creators.js";
import type { ProcessorModuleAction } from "../actions.js";

export default class ProcessorModule_BaseOperations extends BaseDocumentClass<
  ProcessorModuleState,
  ProcessorModuleLocalState,
  ProcessorModuleAction
> {
  public setProcessorName(input: SetProcessorNameInput) {
    return this.dispatch(setProcessorName(input));
  }

  public setProcessorType(input: SetProcessorTypeInput) {
    return this.dispatch(setProcessorType(input));
  }

  public addDocumentType(input: AddDocumentTypeInput) {
    return this.dispatch(addDocumentType(input));
  }

  public removeDocumentType(input: RemoveDocumentTypeInput) {
    return this.dispatch(removeDocumentType(input));
  }

  public setProcessorStatus(input: SetProcessorStatusInput) {
    return this.dispatch(setProcessorStatus(input));
  }
}
