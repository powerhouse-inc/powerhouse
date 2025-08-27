import { BaseDocumentClass } from "../../../document/object.js";
import type { ReducerOptions } from "../../../document/types.js";
import type { DocumentModelAction } from "../actions.js";
import type {
  AddModuleInput,
  DeleteModuleInput,
  DocumentModelLocalState,
  DocumentModelState,
  ReorderModulesInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
} from "../schema/types.js";
import {
  addModule,
  deleteModule,
  reorderModules,
  setModuleDescription,
  setModuleName,
} from "./creators.js";

export default class DocumentModel_Module extends BaseDocumentClass<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
> {
  public addModule(input: AddModuleInput, options?: ReducerOptions) {
    return this.dispatch(addModule(input), options);
  }

  public setModuleName(input: SetModuleNameInput, options?: ReducerOptions) {
    return this.dispatch(setModuleName(input), options);
  }

  public setModuleDescription(
    input: SetModuleDescriptionInput,
    options?: ReducerOptions,
  ) {
    return this.dispatch(setModuleDescription(input), options);
  }

  public deleteModule(input: DeleteModuleInput, options?: ReducerOptions) {
    return this.dispatch(deleteModule(input), options);
  }

  public reorderModules(input: ReorderModulesInput, options?: ReducerOptions) {
    return this.dispatch(reorderModules(input), options);
  }
}
