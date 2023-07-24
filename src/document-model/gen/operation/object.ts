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
} from '@acaldas/document-model-graphql/document-model';

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

export default class DocumentModel_Operation extends BaseDocument<
    DocumentModelState, DocumentModelAction
> {
    public addOperation(input: AddOperationInput) {
        return this.dispatch(addOperation(input));
    }
    
    public setOperationName(input: SetOperationNameInput) {
        return this.dispatch(setOperationName(input));
    }
    
    public setOperationSchema(input: SetOperationSchemaInput) {
        return this.dispatch(setOperationSchema(input));
    }
    
    public setOperationDescription(input: SetOperationDescriptionInput) {
        return this.dispatch(setOperationDescription(input));
    }
    
    public setOperationTemplate(input: SetOperationTemplateInput) {
        return this.dispatch(setOperationTemplate(input));
    }
    
    public setOperationReducer(input: SetOperationReducerInput) {
        return this.dispatch(setOperationReducer(input));
    }
    
    public moveOperation(input: MoveOperationInput) {
        return this.dispatch(moveOperation(input));
    }
    
    public deleteOperation(input: DeleteOperationInput) {
        return this.dispatch(deleteOperation(input));
    }
    
    public reorderModuleOperations(input: ReorderModuleOperationsInput) {
        return this.dispatch(reorderModuleOperations(input));
    }
    
}