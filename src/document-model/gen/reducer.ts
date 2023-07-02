import { DocumentModelState } from "@acaldas/document-model-graphql/document-model";
import { DocumentModelAction } from "./actions";
import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { Document, ImmutableReducer } from "../../document/types";
import { WritableDraft } from "immer/dist/internal";

type ImmutableDocumentModelState = WritableDraft<Document<DocumentModelState, DocumentModelAction>>;

const documentModelReducer: ImmutableReducer<DocumentModelState, DocumentModelAction>  = 
    (state: ImmutableDocumentModelState, action: DocumentModelAction) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "SET_MODEL_NAME":
            case "SET_MODEL_ID":
            case "SET_MODEL_EXTENSION":
            case "SET_MODEL_DESCRIPTION":
            case "SET_AUTHOR_NAME":
            case "SET_AUTHOR_WEBSITE":
            case "ADD_MODULE":
            case "SET_MODULE_NAME":
            case "SET_MODULE_DESCRIPTION":
            case "DELETE_MODULE":
            case "REORDER_MODULES":
            case "ADD_OPERATION_ERROR":
            case "SET_OPERATION_ERROR_CODE":
            case "SET_OPERATION_ERROR_NAME":
            case "SET_OPERATION_ERROR_DESCRIPTION":
            case "SET_OPERATION_ERROR_TEMPLATE":
            case "DELETE_OPERATION_ERROR":
            case "REORDER_OPERATION_ERRORS":
            case "ADD_OPERATION_EXAMPLE":
            case "UPDATE_OPERATION_EXAMPLE":
            case "DELETE_OPERATION_EXAMPLE":
            case "REORDER_OPERATION_EXAMPLES":
            case "ADD_OPERATION":
            case "SET_OPERATION_NAME":
            case "SET_OPERATION_SCHEMA":
            case "SET_OPERATION_DESCRIPTION":
            case "SET_OPERATION_TEMPLATE":
            case "SET_OPERATION_REDUCER":
            case "MOVE_OPERATION":
            case "DELETE_OPERATION":
            case "REORDER_MODULE_OPERATIONS":
            case "SET_STATE_SCHEMA":
            case "ADD_STATE_EXAMPLE":
            case "UPDATE_STATE_EXAMPLE":
            case "DELETE_STATE_EXAMPLE":
            case "REORDER_STATE_EXAMPLES":
            default: 
                return state;
        }
    }

export const reducer = createReducer<DocumentModelState, DocumentModelAction>(documentModelReducer);