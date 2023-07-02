import { BaseDocument } from '../../../document/object';

import {
    addOperationExample,
    updateOperationExample,
    deleteOperationExample,
    reorderOperationExamples,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelOperationExamples extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addOperationExample(operationId: string, example: string) {
        return this.dispatch(addOperationExample(operationId, example));
    }

    public updateOperationExample(id: string, example: string) {
        return this.dispatch(updateOperationExample(id, example));
    }

    public deleteOperationExample(id: string) {
        return this.dispatch(deleteOperationExample(id));
    }

    public reorderOperationExamples(operationId: string, order: string[]) {
        return this.dispatch(reorderOperationExamples(operationId, order));
    }
}