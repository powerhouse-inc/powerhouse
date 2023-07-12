import {
    AddOperationAction,
    SetOperationNameAction,
    SetOperationSchemaAction,
    SetOperationDescriptionAction,
    SetOperationTemplateAction,
    SetOperationReducerAction,
    MoveOperationAction,
    DeleteOperationAction,
    ReorderModuleOperationsAction,
} from './actions';

import { ExtendedDocumentModelState } from '../types';

export interface DocumentModelOperationOperations {
    addOperationOperation: (state: ExtendedDocumentModelState, action: AddOperationAction) => void,
    setOperationNameOperation: (state: ExtendedDocumentModelState, action: SetOperationNameAction) => void,
    setOperationSchemaOperation: (state: ExtendedDocumentModelState, action: SetOperationSchemaAction) => void,
    setOperationDescriptionOperation: (state: ExtendedDocumentModelState, action: SetOperationDescriptionAction) => void,
    setOperationTemplateOperation: (state: ExtendedDocumentModelState, action: SetOperationTemplateAction) => void,
    setOperationReducerOperation: (state: ExtendedDocumentModelState, action: SetOperationReducerAction) => void,
    moveOperationOperation: (state: ExtendedDocumentModelState, action: MoveOperationAction) => void,
    deleteOperationOperation: (state: ExtendedDocumentModelState, action: DeleteOperationAction) => void,
    reorderModuleOperationsOperation: (state: ExtendedDocumentModelState, action: ReorderModuleOperationsAction) => void,
}