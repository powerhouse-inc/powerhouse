import { BaseDocument } from '../../../document/object';


import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
} from '@acaldas/document-model-graphql/document-model';

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

export default class DocumentModel_OperationError extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addOperationError(input: AddOperationErrorInput) {
        return this.dispatch(addOperationError(input));
    }
    
    public setOperationErrorCode(input: SetOperationErrorCodeInput) {
        return this.dispatch(setOperationErrorCode(input));
    }
    
    public setOperationErrorName(input: SetOperationErrorNameInput) {
        return this.dispatch(setOperationErrorName(input));
    }
    
    public setOperationErrorDescription(input: SetOperationErrorDescriptionInput) {
        return this.dispatch(setOperationErrorDescription(input));
    }
    
    public setOperationErrorTemplate(input: SetOperationErrorTemplateInput) {
        return this.dispatch(setOperationErrorTemplate(input));
    }
    
    public deleteOperationError(input: DeleteOperationErrorInput) {
        return this.dispatch(deleteOperationError(input));
    }
    
    public reorderOperationErrors(input: ReorderOperationErrorsInput) {
        return this.dispatch(reorderOperationErrors(input));
    }
    
}