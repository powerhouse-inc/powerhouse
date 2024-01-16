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
import { ReducerOptions } from '../../../document';

export default class DocumentModel_OperationError extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addOperationError(input: AddOperationErrorInput, options?: ReducerOptions) {
        return this.dispatch(addOperationError(input), options);
    }

    public setOperationErrorCode(input: SetOperationErrorCodeInput, options?: ReducerOptions) {
        return this.dispatch(setOperationErrorCode(input), options);
    }

    public setOperationErrorName(input: SetOperationErrorNameInput, options?: ReducerOptions) {
        return this.dispatch(setOperationErrorName(input), options);
    }

    public setOperationErrorDescription(
        input: SetOperationErrorDescriptionInput,
        options?: ReducerOptions,
    ) {
        return this.dispatch(setOperationErrorDescription(input), options);
    }

    public setOperationErrorTemplate(input: SetOperationErrorTemplateInput, options?: ReducerOptions) {
        return this.dispatch(setOperationErrorTemplate(input), options);
    }

    public deleteOperationError(input: DeleteOperationErrorInput, options?: ReducerOptions) {
        return this.dispatch(deleteOperationError(input), options);
    }

    public reorderOperationErrors(input: ReorderOperationErrorsInput, options?: ReducerOptions) {
        return this.dispatch(reorderOperationErrors(input), options);
    }
}
