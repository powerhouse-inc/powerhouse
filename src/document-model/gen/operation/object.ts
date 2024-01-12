import { BaseDocument } from '../../../document/object';

import {
    AddOperationInput,
    SetOperationNameInput,
    SetOperationSchemaInput,
    SetOperationDescriptionInput,
    SetOperationTemplateInput,
    SetOperationReducerInput,
    MoveOperationInput,
    DeleteOperationInput,
    ReorderModuleOperationsInput,
    DocumentModelState,
    SetOperationScopeInput,
    DocumentModelLocalState,
} from '../types';
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
    setOperationScope,
} from './creators';
import { DocumentModelAction } from '../actions';

export default class DocumentModel_Operation extends BaseDocument<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState
> {
    public addOperation(input: AddOperationInput, skip = 0) {
        return this.dispatch(addOperation(input, skip));
    }

    public setOperationName(input: SetOperationNameInput, skip = 0) {
        return this.dispatch(setOperationName(input, skip));
    }

    public setOperationScope(input: SetOperationScopeInput, skip = 0) {
        return this.dispatch(setOperationScope(input, skip));
    }

    public setOperationSchema(input: SetOperationSchemaInput, skip = 0) {
        return this.dispatch(setOperationSchema(input, skip));
    }

    public setOperationDescription(input: SetOperationDescriptionInput, skip = 0) {
        return this.dispatch(setOperationDescription(input, skip));
    }

    public setOperationTemplate(input: SetOperationTemplateInput, skip = 0) {
        return this.dispatch(setOperationTemplate(input, skip));
    }

    public setOperationReducer(input: SetOperationReducerInput, skip = 0) {
        return this.dispatch(setOperationReducer(input, skip));
    }

    public moveOperation(input: MoveOperationInput, skip = 0) {
        return this.dispatch(moveOperation(input, skip));
    }

    public deleteOperation(input: DeleteOperationInput, skip = 0) {
        return this.dispatch(deleteOperation(input, skip));
    }

    public reorderModuleOperations(input: ReorderModuleOperationsInput, skip = 0) {
        return this.dispatch(reorderModuleOperations(input, skip));
    }
}
