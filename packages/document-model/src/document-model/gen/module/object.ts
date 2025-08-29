import type {
  AbstractConstructor,
  Action,
  AddModuleInput,
  AugmentConstructor,
  BaseDocumentClass,
  DeleteModuleInput,
  ReducerOptions,
  ReorderModulesInput,
  SetModuleDescriptionInput,
  SetModuleNameInput,
} from "document-model";
import {
  addModule,
  deleteModule,
  reorderModules,
  setModuleDescription,
  setModuleName,
} from "document-model";

export interface DocumentModel_Module_Augment<TAction extends Action> {
  addModule(input: AddModuleInput, options?: ReducerOptions): this;
  setModuleName(input: SetModuleNameInput, options?: ReducerOptions): this;
  setModuleDescription(
    input: SetModuleDescriptionInput,
    options?: ReducerOptions,
  ): this;
  deleteModule(input: DeleteModuleInput, options?: ReducerOptions): this;
  reorderModules(input: ReorderModulesInput, options?: ReducerOptions): this;
}

export function DocumentModel_Module<
  TGlobalState,
  TLocalState,
  TAction extends Action,
  TBase extends AbstractConstructor<
    BaseDocumentClass<TGlobalState, TLocalState, TAction>
  >,
>(
  Base: TBase,
): AugmentConstructor<TBase, DocumentModel_Module_Augment<TAction>> {
  abstract class DocumentModel_ModuleClass extends Base {
    public addModule(input: AddModuleInput, options?: ReducerOptions) {
      return this.dispatch(addModule(input) as TAction, options);
    }
    public setModuleName(input: SetModuleNameInput, options?: ReducerOptions) {
      return this.dispatch(setModuleName(input) as TAction, options);
    }
    public setModuleDescription(
      input: SetModuleDescriptionInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(setModuleDescription(input) as TAction, options);
    }
    public deleteModule(input: DeleteModuleInput, options?: ReducerOptions) {
      return this.dispatch(deleteModule(input) as TAction, options);
    }
    public reorderModules(
      input: ReorderModulesInput,
      options?: ReducerOptions,
    ) {
      return this.dispatch(reorderModules(input) as TAction, options);
    }
  }
  return DocumentModel_ModuleClass as unknown as AugmentConstructor<
    TBase,
    DocumentModel_Module_Augment<TAction>
  >;
}
