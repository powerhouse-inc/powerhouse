import type {
  AddModuleInput,
  DeleteModuleInput,
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
  ReducerOptions,
  ReorderModulesInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
} from "document-model";
import { BaseDocumentClass } from "document-model";
import {
  addModule,
  deleteModule,
  reorderModules,
  setModuleDescription,
  setModuleName,
} from "document-model";

export class DocumentModel_Module extends BaseDocumentClass<
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
