import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { Document, ImmutableReducer } from "../../document/types";
import { WritableDraft } from "immer/dist/internal";

import { DocumentModelState } from '@acaldas/document-model-graphql/document-model';
import { DocumentModelAction } from './actions';

import { reducer as HeaderReducer } from '../custom/header/reducer';
import { reducer as ModuleReducer } from '../custom/module/reducer';
import { reducer as OperationErrorReducer } from '../custom/operation-error/reducer';
import { reducer as OperationExampleReducer } from '../custom/operation-example/reducer';
import { reducer as OperationReducer } from '../custom/operation/reducer';
import { reducer as StateReducer } from '../custom/state/reducer';


type ImmutableDocumentModelState = WritableDraft<Document<DocumentModelState, DocumentModelAction>>;

const stateReducer: ImmutableReducer<DocumentModelState, DocumentModelAction> =
    (state: ImmutableDocumentModelState, action: DocumentModelAction) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "SET_MODEL_NAME":
                HeaderReducer.setModelNameOperation(state, action);
                break;

            case "SET_MODEL_ID":
                HeaderReducer.setModelIdOperation(state, action);
                break;

            case "SET_MODEL_EXTENSION":
                HeaderReducer.setModelExtensionOperation(state, action);
                break;

            case "SET_MODEL_DESCRIPTION":
                HeaderReducer.setModelDescriptionOperation(state, action);
                break;

            case "SET_AUTHOR_NAME":
                HeaderReducer.setAuthorNameOperation(state, action);
                break;

            case "SET_AUTHOR_WEBSITE":
                HeaderReducer.setAuthorWebsiteOperation(state, action);
                break;

            case "ADD_MODULE":
                ModuleReducer.addModuleOperation(state, action);
                break;

            case "SET_MODULE_NAME":
                ModuleReducer.setModuleNameOperation(state, action);
                break;

            case "SET_MODULE_DESCRIPTION":
                ModuleReducer.setModuleDescriptionOperation(state, action);
                break;

            case "DELETE_MODULE":
                ModuleReducer.deleteModuleOperation(state, action);
                break;

            case "REORDER_MODULES":
                ModuleReducer.reorderModulesOperation(state, action);
                break;

            case "ADD_OPERATION_ERROR":
                OperationErrorReducer.addOperationErrorOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_CODE":
                OperationErrorReducer.setOperationErrorCodeOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_NAME":
                OperationErrorReducer.setOperationErrorNameOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_DESCRIPTION":
                OperationErrorReducer.setOperationErrorDescriptionOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_TEMPLATE":
                OperationErrorReducer.setOperationErrorTemplateOperation(state, action);
                break;

            case "DELETE_OPERATION_ERROR":
                OperationErrorReducer.deleteOperationErrorOperation(state, action);
                break;

            case "REORDER_OPERATION_ERRORS":
                OperationErrorReducer.reorderOperationErrorsOperation(state, action);
                break;

            case "ADD_OPERATION_EXAMPLE":
                OperationExampleReducer.addOperationExampleOperation(state, action);
                break;

            case "UPDATE_OPERATION_EXAMPLE":
                OperationExampleReducer.updateOperationExampleOperation(state, action);
                break;

            case "DELETE_OPERATION_EXAMPLE":
                OperationExampleReducer.deleteOperationExampleOperation(state, action);
                break;

            case "REORDER_OPERATION_EXAMPLES":
                OperationExampleReducer.reorderOperationExamplesOperation(state, action);
                break;

            case "ADD_OPERATION":
                OperationReducer.addOperationOperation(state, action);
                break;

            case "SET_OPERATION_NAME":
                OperationReducer.setOperationNameOperation(state, action);
                break;

            case "SET_OPERATION_SCHEMA":
                OperationReducer.setOperationSchemaOperation(state, action);
                break;

            case "SET_OPERATION_DESCRIPTION":
                OperationReducer.setOperationDescriptionOperation(state, action);
                break;

            case "SET_OPERATION_TEMPLATE":
                OperationReducer.setOperationTemplateOperation(state, action);
                break;

            case "SET_OPERATION_REDUCER":
                OperationReducer.setOperationReducerOperation(state, action);
                break;

            case "MOVE_OPERATION":
                OperationReducer.moveOperationOperation(state, action);
                break;

            case "DELETE_OPERATION":
                OperationReducer.deleteOperationOperation(state, action);
                break;

            case "REORDER_MODULE_OPERATIONS":
                OperationReducer.reorderModuleOperationsOperation(state, action);
                break;

            case "SET_STATE_SCHEMA":
                StateReducer.setStateSchemaOperation(state, action);
                break;

            case "ADD_STATE_EXAMPLE":
                StateReducer.addStateExampleOperation(state, action);
                break;

            case "UPDATE_STATE_EXAMPLE":
                StateReducer.updateStateExampleOperation(state, action);
                break;

            case "DELETE_STATE_EXAMPLE":
                StateReducer.deleteStateExampleOperation(state, action);
                break;

            case "REORDER_STATE_EXAMPLES":
                StateReducer.reorderStateExamplesOperation(state, action);
                break;

            default:
                return state;
        }
    }

export const reducer = createReducer<DocumentModelState, DocumentModelAction>(stateReducer);
