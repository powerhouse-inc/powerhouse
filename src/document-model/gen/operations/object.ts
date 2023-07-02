import { BaseDocument } from '../../../document/object';

import {
    addOperation,
    setOperationName,
    setOperationSchema,
    setOperationDescription,
    setOperationTemplate,
    setOperationReducer,
    moveOperation,
    deleteOperation,
    reorderModuleOperations,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelOperations extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addOperation(name: string) {
        return this.dispatch(addOperation(name));
    }

    public setOperationName(id: string, name: string) {
        return this.dispatch(setOperationName(id, name));
    }

    public setOperationSchema(id: string, schema: string) {
        return this.dispatch(setOperationSchema(id, schema));
    }

    public setOperationDescription(id: string, description: string) {
        return this.dispatch(setOperationDescription(id, description));
    }

    public setOperationTemplate(id: string, template: string) {
        return this.dispatch(setOperationTemplate(id, template));
    }

    public setOperationReducer(id: string, reducer: string) {
        return this.dispatch(setOperationReducer(id, reducer));
    }

    public moveOperation(operationId: string, newModuleId: string) {
        return this.dispatch(moveOperation(operationId, newModuleId));
    }

    public deleteOperation(id: string) {
        return this.dispatch(deleteOperation(id));
    }

    public reorderModuleOperations(moduleId: string, order: string[]) {
        return this.dispatch(reorderModuleOperations(moduleId, order));
    }
}