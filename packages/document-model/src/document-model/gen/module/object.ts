import { BaseDocument } from "@document/object.js";
import {
  AddModuleInput,
  SetModuleNameInput,
  SetModuleDescriptionInput,
  DeleteModuleInput,
  ReorderModulesInput,
  DocumentModelState,
  DocumentModelLocalState
} from "../schema/types.js";
import {
  addModule,
  setModuleName,
  setModuleDescription,
  deleteModule,
  reorderModules,
} from "./creators.js";
import { ReducerOptions } from "@document/types.js";
import { DocumentModelAction } from "../actions.js";

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
