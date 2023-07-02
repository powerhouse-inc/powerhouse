import { BaseDocument } from '../../../document/object';

import {
    addOperationError,
    setOperationErrorCode,
    setOperationErrorName,
    setOperationErrorDescription,
    setOperationErrorTemplate,
    deleteOperationError,
    reorderOperationErrors,
} from './creators';

import { DocumentModelAction } from '../actions';
import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';

export default class DocumentModelOperationErrors extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addOperationError(operationId: string, errorCode?: string, errorName?: string, errorDescription?: string, errorTemplate?: string) {
        return this.dispatch(addOperationError(operationId, errorCode, errorName, errorDescription, errorTemplate));
    }

    public setOperationErrorCode(id: string, errorCode: string) {
        return this.dispatch(setOperationErrorCode(id, errorCode));
    }

    public setOperationErrorName(id: string, errorName: string) {
        return this.dispatch(setOperationErrorName(id, errorName));
    }

    public setOperationErrorDescription(id: string, errorDescription: string) {
        return this.dispatch(setOperationErrorDescription(id, errorDescription));
    }

    public setOperationErrorTemplate(id: string, errorTemplate: string) {
        return this.dispatch(setOperationErrorTemplate(id, errorTemplate));
    }

    public deleteOperationError(id: string) {
        return this.dispatch(deleteOperationError(id));
    }

    public reorderOperationErrors(operationId: string, order: string[]) {
        return this.dispatch(reorderOperationErrors(operationId, order));
    }
}