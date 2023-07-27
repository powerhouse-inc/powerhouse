import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { ImmutableStateReducer } from "../../document/types";
import { DocumentModelState, z } from '@acaldas/document-model-graphql/document-model';
import { DocumentModelAction } from './actions';

import { reducer as HeaderReducer } from '../custom/reducers/header';
import { reducer as ModuleReducer } from '../custom/reducers/module';
import { reducer as OperationErrorReducer } from '../custom/reducers/operation-error';
import { reducer as OperationExampleReducer } from '../custom/reducers/operation-example';
import { reducer as OperationReducer } from '../custom/reducers/operation';
import { reducer as StateReducer } from '../custom/reducers/state';


const stateReducer: ImmutableStateReducer<DocumentModelState, DocumentModelAction> =
    (state, action) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "SET_MODEL_NAME":
                z.SetModelNameInputSchema().parse(action.input);
                HeaderReducer.setModelNameOperation(state, action);
                break;

            case "SET_MODEL_ID":
                z.SetModelIdInputSchema().parse(action.input);
                HeaderReducer.setModelIdOperation(state, action);
                break;

            case "SET_MODEL_EXTENSION":
                z.SetModelExtensionInputSchema().parse(action.input);
                HeaderReducer.setModelExtensionOperation(state, action);
                break;

            case "SET_MODEL_DESCRIPTION":
                z.SetModelDescriptionInputSchema().parse(action.input);
                HeaderReducer.setModelDescriptionOperation(state, action);
                break;

            case "SET_AUTHOR_NAME":
                z.SetAuthorNameInputSchema().parse(action.input);
                HeaderReducer.setAuthorNameOperation(state, action);
                break;

            case "SET_AUTHOR_WEBSITE":
                z.SetAuthorWebsiteInputSchema().parse(action.input);
                HeaderReducer.setAuthorWebsiteOperation(state, action);
                break;

            case "ADD_MODULE":
                z.AddModuleInputSchema().parse(action.input);
                ModuleReducer.addModuleOperation(state, action);
                break;

            case "SET_MODULE_NAME":
                z.SetModuleNameInputSchema().parse(action.input);
                ModuleReducer.setModuleNameOperation(state, action);
                break;

            case "SET_MODULE_DESCRIPTION":
                z.SetModuleDescriptionInputSchema().parse(action.input);
                ModuleReducer.setModuleDescriptionOperation(state, action);
                break;

            case "DELETE_MODULE":
                z.DeleteModuleInputSchema().parse(action.input);
                ModuleReducer.deleteModuleOperation(state, action);
                break;

            case "REORDER_MODULES":
                z.ReorderModulesInputSchema().parse(action.input);
                ModuleReducer.reorderModulesOperation(state, action);
                break;

            case "ADD_OPERATION_ERROR":
                z.AddOperationErrorInputSchema().parse(action.input);
                OperationErrorReducer.addOperationErrorOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_CODE":
                z.SetOperationErrorCodeInputSchema().parse(action.input);
                OperationErrorReducer.setOperationErrorCodeOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_NAME":
                z.SetOperationErrorNameInputSchema().parse(action.input);
                OperationErrorReducer.setOperationErrorNameOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_DESCRIPTION":
                z.SetOperationErrorDescriptionInputSchema().parse(action.input);
                OperationErrorReducer.setOperationErrorDescriptionOperation(state, action);
                break;

            case "SET_OPERATION_ERROR_TEMPLATE":
                z.SetOperationErrorTemplateInputSchema().parse(action.input);
                OperationErrorReducer.setOperationErrorTemplateOperation(state, action);
                break;

            case "DELETE_OPERATION_ERROR":
                z.DeleteOperationErrorInputSchema().parse(action.input);
                OperationErrorReducer.deleteOperationErrorOperation(state, action);
                break;

            case "REORDER_OPERATION_ERRORS":
                z.ReorderOperationErrorsInputSchema().parse(action.input);
                OperationErrorReducer.reorderOperationErrorsOperation(state, action);
                break;

            case "ADD_OPERATION_EXAMPLE":
                z.AddOperationExampleInputSchema().parse(action.input);
                OperationExampleReducer.addOperationExampleOperation(state, action);
                break;

            case "UPDATE_OPERATION_EXAMPLE":
                z.UpdateOperationExampleInputSchema().parse(action.input);
                OperationExampleReducer.updateOperationExampleOperation(state, action);
                break;

            case "DELETE_OPERATION_EXAMPLE":
                z.DeleteOperationExampleInputSchema().parse(action.input);
                OperationExampleReducer.deleteOperationExampleOperation(state, action);
                break;

            case "REORDER_OPERATION_EXAMPLES":
                z.ReorderOperationExamplesInputSchema().parse(action.input);
                OperationExampleReducer.reorderOperationExamplesOperation(state, action);
                break;

            case "ADD_OPERATION":
                z.AddOperationInputSchema().parse(action.input);
                OperationReducer.addOperationOperation(state, action);
                break;

            case "SET_OPERATION_NAME":
                z.SetOperationNameInputSchema().parse(action.input);
                OperationReducer.setOperationNameOperation(state, action);
                break;

            case "SET_OPERATION_SCHEMA":
                z.SetOperationSchemaInputSchema().parse(action.input);
                OperationReducer.setOperationSchemaOperation(state, action);
                break;

            case "SET_OPERATION_DESCRIPTION":
                z.SetOperationDescriptionInputSchema().parse(action.input);
                OperationReducer.setOperationDescriptionOperation(state, action);
                break;

            case "SET_OPERATION_TEMPLATE":
                z.SetOperationTemplateInputSchema().parse(action.input);
                OperationReducer.setOperationTemplateOperation(state, action);
                break;

            case "SET_OPERATION_REDUCER":
                z.SetOperationReducerInputSchema().parse(action.input);
                OperationReducer.setOperationReducerOperation(state, action);
                break;

            case "MOVE_OPERATION":
                z.MoveOperationInputSchema().parse(action.input);
                OperationReducer.moveOperationOperation(state, action);
                break;

            case "DELETE_OPERATION":
                z.DeleteOperationInputSchema().parse(action.input);
                OperationReducer.deleteOperationOperation(state, action);
                break;

            case "REORDER_MODULE_OPERATIONS":
                z.ReorderModuleOperationsInputSchema().parse(action.input);
                OperationReducer.reorderModuleOperationsOperation(state, action);
                break;

            case "SET_STATE_SCHEMA":
                z.SetStateSchemaInputSchema().parse(action.input);
                StateReducer.setStateSchemaOperation(state, action);
                break;

            case "ADD_STATE_EXAMPLE":
                z.AddStateExampleInputSchema().parse(action.input);
                StateReducer.addStateExampleOperation(state, action);
                break;

            case "UPDATE_STATE_EXAMPLE":
                z.UpdateStateExampleInputSchema().parse(action.input);
                StateReducer.updateStateExampleOperation(state, action);
                break;

            case "DELETE_STATE_EXAMPLE":
                z.DeleteStateExampleInputSchema().parse(action.input);
                StateReducer.deleteStateExampleOperation(state, action);
                break;

            case "REORDER_STATE_EXAMPLES":
                z.ReorderStateExamplesInputSchema().parse(action.input);
                StateReducer.reorderStateExamplesOperation(state, action);
                break;

            default:
                return state;
        }
    }

export const reducer = createReducer<DocumentModelState, DocumentModelAction>(stateReducer);
