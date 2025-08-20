import { DocumentModelAction } from "../../document-model/gen/actions.js";
import {
  type DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
} from "../../document-model/gen/types.js";
import { type StateReducer as TStateReducer } from "../../document/types.js";
import { createReducer, isDocumentAction } from "../../document/utils/base.js";
import { reducer as HeaderReducer } from "../custom/reducers/header.js";
import { reducer as ModuleReducer } from "../custom/reducers/module.js";
import { reducer as OperationErrorReducer } from "../custom/reducers/operation-error.js";
import { reducer as OperationExampleReducer } from "../custom/reducers/operation-example.js";
import { reducer as OperationReducer } from "../custom/reducers/operation.js";
import { reducer as StateReducer } from "../custom/reducers/state.js";
import { reducer as VersioningReducer } from "../custom/reducers/versioning.js";
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
} from "./schema/zod.js";

export const stateReducer: TStateReducer<DocumentModelDocument> = (
  state,
  action,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_MODEL_NAME":
      SetModelNameInputSchema().parse(action.input);
      HeaderReducer.setModelNameOperation(state.global, action as any);
      break;

    case "SET_MODEL_ID":
      SetModelIdInputSchema().parse(action.input);
      HeaderReducer.setModelIdOperation(state.global, action as any);
      break;

    case "SET_MODEL_EXTENSION":
      SetModelExtensionInputSchema().parse(action.input);
      HeaderReducer.setModelExtensionOperation(state.global, action as any);
      break;

    case "SET_MODEL_DESCRIPTION":
      SetModelDescriptionInputSchema().parse(action.input);
      HeaderReducer.setModelDescriptionOperation(state.global, action as any);
      break;

    case "SET_AUTHOR_NAME":
      SetAuthorNameInputSchema().parse(action.input);
      HeaderReducer.setAuthorNameOperation(state.global, action as any);
      break;

    case "SET_AUTHOR_WEBSITE":
      SetAuthorWebsiteInputSchema().parse(action.input);
      HeaderReducer.setAuthorWebsiteOperation(state.global, action as any);
      break;

    case "ADD_CHANGE_LOG_ITEM":
      AddChangeLogItemInputSchema().parse(action.input);
      VersioningReducer.addChangeLogItemOperation(state.global, action as any);
      break;

    case "UPDATE_CHANGE_LOG_ITEM":
      UpdateChangeLogItemInputSchema().parse(action.input);
      VersioningReducer.updateChangeLogItemOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_CHANGE_LOG_ITEM":
      DeleteChangeLogItemInputSchema().parse(action.input);
      VersioningReducer.deleteChangeLogItemOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_CHANGE_LOG_ITEMS":
      ReorderChangeLogItemsInputSchema().parse(action.input);
      VersioningReducer.reorderChangeLogItemsOperation(
        state.global,
        action as any,
      );
      break;

    case "RELEASE_NEW_VERSION":
      if (Object.keys(action.input as object).length > 0)
        throw new Error("Expected empty input for action RELEASE_NEW_VERSION");
      VersioningReducer.releaseNewVersionOperation(state.global, action as any);
      break;

    case "ADD_MODULE":
      AddModuleInputSchema().parse(action.input);
      ModuleReducer.addModuleOperation(state.global, action as any);
      break;

    case "SET_MODULE_NAME":
      SetModuleNameInputSchema().parse(action.input);
      ModuleReducer.setModuleNameOperation(state.global, action as any);
      break;

    case "SET_MODULE_DESCRIPTION":
      SetModuleDescriptionInputSchema().parse(action.input);
      ModuleReducer.setModuleDescriptionOperation(state.global, action as any);
      break;

    case "DELETE_MODULE":
      DeleteModuleInputSchema().parse(action.input);
      ModuleReducer.deleteModuleOperation(state.global, action as any);
      break;

    case "REORDER_MODULES":
      ReorderModulesInputSchema().parse(action.input);
      ModuleReducer.reorderModulesOperation(state.global, action as any);
      break;

    case "ADD_OPERATION_ERROR":
      AddOperationErrorInputSchema().parse(action.input);
      OperationErrorReducer.addOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_CODE":
      SetOperationErrorCodeInputSchema().parse(action.input);
      OperationErrorReducer.setOperationErrorCodeOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_NAME":
      SetOperationErrorNameInputSchema().parse(action.input);
      OperationErrorReducer.setOperationErrorNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_DESCRIPTION":
      SetOperationErrorDescriptionInputSchema().parse(action.input);
      OperationErrorReducer.setOperationErrorDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_TEMPLATE":
      SetOperationErrorTemplateInputSchema().parse(action.input);
      OperationErrorReducer.setOperationErrorTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_ERROR":
      DeleteOperationErrorInputSchema().parse(action.input);
      OperationErrorReducer.deleteOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_ERRORS":
      ReorderOperationErrorsInputSchema().parse(action.input);
      OperationErrorReducer.reorderOperationErrorsOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION_EXAMPLE":
      AddOperationExampleInputSchema().parse(action.input);
      OperationExampleReducer.addOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_OPERATION_EXAMPLE":
      UpdateOperationExampleInputSchema().parse(action.input);
      OperationExampleReducer.updateOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_EXAMPLE":
      DeleteOperationExampleInputSchema().parse(action.input);
      OperationExampleReducer.deleteOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_EXAMPLES":
      ReorderOperationExamplesInputSchema().parse(action.input);
      OperationExampleReducer.reorderOperationExamplesOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION":
      AddOperationInputSchema().parse(action.input);
      OperationReducer.addOperationOperation(state.global, action as any);
      break;

    case "SET_OPERATION_NAME":
      SetOperationNameInputSchema().parse(action.input);
      OperationReducer.setOperationNameOperation(state.global, action as any);
      break;

    case "SET_OPERATION_SCOPE":
      SetOperationScopeInputSchema().parse(action.input);
      OperationReducer.setOperationScopeOperation(state.global, action as any);
      break;

    case "SET_OPERATION_SCHEMA":
      SetOperationSchemaInputSchema().parse(action.input);
      OperationReducer.setOperationSchemaOperation(state.global, action as any);
      break;

    case "SET_OPERATION_DESCRIPTION":
      SetOperationDescriptionInputSchema().parse(action.input);
      OperationReducer.setOperationDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_TEMPLATE":
      SetOperationTemplateInputSchema().parse(action.input);
      OperationReducer.setOperationTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_REDUCER":
      SetOperationReducerInputSchema().parse(action.input);
      OperationReducer.setOperationReducerOperation(
        state.global,
        action as any,
      );
      break;

    case "MOVE_OPERATION":
      MoveOperationInputSchema().parse(action.input);
      OperationReducer.moveOperationOperation(state.global, action as any);
      break;

    case "DELETE_OPERATION":
      DeleteOperationInputSchema().parse(action.input);
      OperationReducer.deleteOperationOperation(state.global, action as any);
      break;

    case "REORDER_MODULE_OPERATIONS":
      ReorderModuleOperationsInputSchema().parse(action.input);
      OperationReducer.reorderModuleOperationsOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_STATE_SCHEMA":
      SetStateSchemaInputSchema().parse(action.input);
      StateReducer.setStateSchemaOperation(state.global, action as any);
      break;

    case "SET_INITIAL_STATE":
      SetInitialStateInputSchema().parse(action.input);
      StateReducer.setInitialStateOperation(state.global, action as any);
      break;

    case "ADD_STATE_EXAMPLE":
      AddStateExampleInputSchema().parse(action.input);
      StateReducer.addStateExampleOperation(state.global, action as any);
      break;

    case "UPDATE_STATE_EXAMPLE":
      UpdateStateExampleInputSchema().parse(action.input);
      StateReducer.updateStateExampleOperation(state.global, action as any);
      break;

    case "DELETE_STATE_EXAMPLE":
      DeleteStateExampleInputSchema().parse(action.input);
      StateReducer.deleteStateExampleOperation(state.global, action as any);
      break;

    case "REORDER_STATE_EXAMPLES":
      ReorderStateExamplesInputSchema().parse(action.input);
      StateReducer.reorderStateExamplesOperation(state.global, action as any);
      break;

    default:
      return state;
  }
};

export const reducer = createReducer<DocumentModelDocument>(stateReducer);
