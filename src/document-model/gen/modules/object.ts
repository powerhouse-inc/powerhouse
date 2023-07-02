import { BaseDocument } from '../../../document/object';

import {
    addModule,
    setModuleName,
    setModuleDescription,
    deleteModule,
    reorderModules,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelModules extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addModule(name: string, description: string) {
        return this.dispatch(addModule(name, description));
    }

    public setModuleName(id: string, name: string) {
        return this.dispatch(setModuleName(id, name));
    }

    public setModuleDescription(id: string, description: string) {
        return this.dispatch(setModuleDescription(id, description));
    }

    public deleteModule(id: string) {
        return this.dispatch(deleteModule(id));
    }

    public reorderModules(order: string[]) {
        return this.dispatch(reorderModules(order));
    }
}