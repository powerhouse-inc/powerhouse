import { BaseDocument } from "../../../document/object";

import {
  AddModuleInput,
  SetModuleNameInput,
  SetModuleDescriptionInput,
  DeleteModuleInput,
  ReorderModulesInput,
  DocumentModelState,
  DocumentModelLocalState,
} from "../types";
import {
  addModule,
  setModuleName,
  setModuleDescription,
  deleteModule,
  reorderModules,
} from "./creators";
import { DocumentModelAction } from "../actions";
import { ReducerOptions } from "../../../document";

export default class DocumentModel_Module extends BaseDocument<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
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
