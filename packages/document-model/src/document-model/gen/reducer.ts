import type {
  DocumentModelDocument,
  StateReducer as TStateReducer,
} from "document-model";
import {
  AddChangeLogItemInputSchema,
  AddModuleInputSchema,
  AddOperationErrorInputSchema,
  AddOperationExampleInputSchema,
  AddOperationInputSchema,
  AddStateExampleInputSchema,
  DeleteChangeLogItemInputSchema,
  DeleteModuleInputSchema,
  DeleteOperationErrorInputSchema,
  DeleteOperationExampleInputSchema,
  DeleteOperationInputSchema,
  DeleteStateExampleInputSchema,
  documentModelHeaderReducer,
  documentModelModuleReducer,
  documentModelOperationErrorReducer,
  documentModelOperationExampleReducer,
  documentModelOperationReducer,
  documentModelStateSchemaReducer,
  documentModelVersioningReducer,
  isDocumentAction,
  MoveOperationInputSchema,
  ReorderChangeLogItemsInputSchema,
  ReorderModuleOperationsInputSchema,
  ReorderModulesInputSchema,
  ReorderOperationErrorsInputSchema,
  ReorderOperationExamplesInputSchema,
  ReorderStateExamplesInputSchema,
  SetAuthorNameInputSchema,
  SetAuthorWebsiteInputSchema,
  SetInitialStateInputSchema,
  SetModelDescriptionInputSchema,
  SetModelExtensionInputSchema,
  SetModelIdInputSchema,
  SetModelNameInputSchema,
  SetModuleDescriptionInputSchema,
  SetModuleNameInputSchema,
  SetOperationDescriptionInputSchema,
  SetOperationErrorCodeInputSchema,
  SetOperationErrorDescriptionInputSchema,
  SetOperationErrorNameInputSchema,
  SetOperationErrorTemplateInputSchema,
  SetOperationNameInputSchema,
  SetOperationReducerInputSchema,
  SetOperationSchemaInputSchema,
  SetOperationScopeInputSchema,
  SetOperationTemplateInputSchema,
  SetStateSchemaInputSchema,
  UpdateChangeLogItemInputSchema,
  UpdateOperationExampleInputSchema,
  UpdateStateExampleInputSchema,
} from "document-model";
import { createReducer } from "../../document/reducer.js";

export const documentModelStateReducer: TStateReducer<DocumentModelDocument> = (
  state,
  action,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_MODEL_NAME":
      SetModelNameInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODEL_ID":
      SetModelIdInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelIdOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODEL_EXTENSION":
      SetModelExtensionInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelExtensionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODEL_DESCRIPTION":
      SetModelDescriptionInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_AUTHOR_NAME":
      SetAuthorNameInputSchema().parse(action.input);
      documentModelHeaderReducer.setAuthorNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_AUTHOR_WEBSITE":
      SetAuthorWebsiteInputSchema().parse(action.input);
      documentModelHeaderReducer.setAuthorWebsiteOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_CHANGE_LOG_ITEM":
      AddChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.addChangeLogItemOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_CHANGE_LOG_ITEM":
      UpdateChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.updateChangeLogItemOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_CHANGE_LOG_ITEM":
      DeleteChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.deleteChangeLogItemOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_CHANGE_LOG_ITEMS":
      ReorderChangeLogItemsInputSchema().parse(action.input);
      documentModelVersioningReducer.reorderChangeLogItemsOperation(
        state.global,
        action as any,
      );
      break;

    case "RELEASE_NEW_VERSION":
      if (Object.keys(action.input as object).length > 0)
        throw new Error("Expected empty input for action RELEASE_NEW_VERSION");
      documentModelVersioningReducer.releaseNewVersionOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_MODULE":
      AddModuleInputSchema().parse(action.input);
      documentModelModuleReducer.addModuleOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODULE_NAME":
      SetModuleNameInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODULE_DESCRIPTION":
      SetModuleDescriptionInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_MODULE":
      DeleteModuleInputSchema().parse(action.input);
      documentModelModuleReducer.deleteModuleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_MODULES":
      ReorderModulesInputSchema().parse(action.input);
      documentModelModuleReducer.reorderModulesOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION_ERROR":
      AddOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.addOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_CODE":
      SetOperationErrorCodeInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorCodeOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_NAME":
      SetOperationErrorNameInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_DESCRIPTION":
      SetOperationErrorDescriptionInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_TEMPLATE":
      SetOperationErrorTemplateInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_ERROR":
      DeleteOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.deleteOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_ERRORS":
      ReorderOperationErrorsInputSchema().parse(action.input);
      documentModelOperationErrorReducer.reorderOperationErrorsOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION_EXAMPLE":
      AddOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.addOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_OPERATION_EXAMPLE":
      UpdateOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.updateOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_EXAMPLE":
      DeleteOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.deleteOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_EXAMPLES":
      ReorderOperationExamplesInputSchema().parse(action.input);
      documentModelOperationExampleReducer.reorderOperationExamplesOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION":
      AddOperationInputSchema().parse(action.input);
      documentModelOperationReducer.addOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_NAME":
      SetOperationNameInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_SCOPE":
      SetOperationScopeInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationScopeOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_SCHEMA":
      SetOperationSchemaInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationSchemaOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_DESCRIPTION":
      SetOperationDescriptionInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_TEMPLATE":
      SetOperationTemplateInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_REDUCER":
      SetOperationReducerInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationReducerOperation(
        state.global,
        action as any,
      );
      break;

    case "MOVE_OPERATION":
      MoveOperationInputSchema().parse(action.input);
      documentModelOperationReducer.moveOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION":
      DeleteOperationInputSchema().parse(action.input);
      documentModelOperationReducer.deleteOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_MODULE_OPERATIONS":
      ReorderModuleOperationsInputSchema().parse(action.input);
      documentModelOperationReducer.reorderModuleOperationsOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_STATE_SCHEMA":
      SetStateSchemaInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setStateSchemaOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_INITIAL_STATE":
      SetInitialStateInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setInitialStateOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_STATE_EXAMPLE":
      AddStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.addStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_STATE_EXAMPLE":
      UpdateStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.updateStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_STATE_EXAMPLE":
      DeleteStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.deleteStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_STATE_EXAMPLES":
      ReorderStateExamplesInputSchema().parse(action.input);
      documentModelStateSchemaReducer.reorderStateExamplesOperation(
        state.global,
        action as any,
      );
      break;

    default:
      return state;
  }
};

export const documentModelReducer = createReducer<DocumentModelDocument>(
  documentModelStateReducer,
);
