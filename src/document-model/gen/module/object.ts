import { BaseDocument } from '../../../document/object';

import {
    AddModuleInput,
    SetModuleNameInput,
    SetModuleDescriptionInput,
    DeleteModuleInput,
    ReorderModulesInput,
    DocumentModelState,
    DocumentModelLocalState,
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
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addModule(input: AddModuleInput, skip = 0) {
        return this.dispatch(addModule(input, skip));
    }

    public setModuleName(input: SetModuleNameInput, skip = 0) {
        return this.dispatch(setModuleName(input, skip));
    }

    public setModuleDescription(input: SetModuleDescriptionInput, skip = 0) {
        return this.dispatch(setModuleDescription(input, skip));
    }

    public deleteModule(input: DeleteModuleInput, skip = 0) {
        return this.dispatch(deleteModule(input, skip));
    }

    public reorderModules(input: ReorderModulesInput, skip = 0) {
        return this.dispatch(reorderModules(input, skip));
    }
}
