import { BaseDocument } from '../../../document/object';

import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
    DocumentModelState,
    DocumentModelLocalState,
} from '../types';
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

export default class DocumentModel_OperationError extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addOperationError(input: AddOperationErrorInput, skip = 0) {
        return this.dispatch(addOperationError(input, skip));
    }

    public setOperationErrorCode(input: SetOperationErrorCodeInput, skip = 0) {
        return this.dispatch(setOperationErrorCode(input, skip));
    }

    public setOperationErrorName(input: SetOperationErrorNameInput, skip = 0) {
        return this.dispatch(setOperationErrorName(input, skip));
    }

    public setOperationErrorDescription(
        input: SetOperationErrorDescriptionInput,
        skip = 0
    ) {
        return this.dispatch(setOperationErrorDescription(input, skip));
    }

    public setOperationErrorTemplate(input: SetOperationErrorTemplateInput, skip = 0) {
        return this.dispatch(setOperationErrorTemplate(input, skip));
    }

    public deleteOperationError(input: DeleteOperationErrorInput, skip = 0) {
        return this.dispatch(deleteOperationError(input, skip));
    }

    public reorderOperationErrors(input: ReorderOperationErrorsInput, skip = 0) {
        return this.dispatch(reorderOperationErrors(input, skip));
    }
}
