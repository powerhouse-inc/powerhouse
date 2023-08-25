import { BaseDocument } from '../../../document/object';

import {
    AddModuleInput,
    SetModuleNameInput,
    SetModuleDescriptionInput,
    DeleteModuleInput,
    ReorderModulesInput,
    DocumentModelState
} from '../types';
import {
    addModule,
    setModuleName,
    setModuleDescription,
    deleteModule,
    reorderModules,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_Module extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addModule(input: AddModuleInput) {
        return this.dispatch(addModule(input));
    }
    
    public setModuleName(input: SetModuleNameInput) {
        return this.dispatch(setModuleName(input));
    }
    
    public setModuleDescription(input: SetModuleDescriptionInput) {
        return this.dispatch(setModuleDescription(input));
    }
    
    public deleteModule(input: DeleteModuleInput) {
        return this.dispatch(deleteModule(input));
    }
    
    public reorderModules(input: ReorderModulesInput) {
        return this.dispatch(reorderModules(input));
    }
    
}