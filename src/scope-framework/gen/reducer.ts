import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { Document, ImmutableReducer } from "../../document/types";
import { WritableDraft } from "immer/dist/internal";

import { ScopeFrameworkState } from '@acaldas/document-model-graphql/scope-framework';
import { ScopeFrameworkAction } from './actions';

import { reducer as MainReducer } from '../custom/reducers/main';


type ImmutableScopeFrameworkState = WritableDraft<Document<ScopeFrameworkState, ScopeFrameworkAction>>;

const stateReducer: ImmutableReducer<ScopeFrameworkState, ScopeFrameworkAction> =
    (state: ImmutableScopeFrameworkState, action: ScopeFrameworkAction) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "SET_ROOT_PATH":
                MainReducer.setRootPathOperation(state, action);
                break;

            case "ADD_ELEMENT":
                MainReducer.addElementOperation(state, action);
                break;

            case "UPDATE_ELEMENT_TYPE":
                MainReducer.updateElementTypeOperation(state, action);
                break;

            case "UPDATE_ELEMENT_NAME":
                MainReducer.updateElementNameOperation(state, action);
                break;

            case "UPDATE_ELEMENT_COMPONENTS":
                MainReducer.updateElementComponentsOperation(state, action);
                break;

            case "REMOVE_ELEMENT":
                MainReducer.removeElementOperation(state, action);
                break;

            case "REORDER_ELEMENTS":
                MainReducer.reorderElementsOperation(state, action);
                break;

            case "MOVE_ELEMENT":
                MainReducer.moveElementOperation(state, action);
                break;

            default:
                return state;
        }
    }

export const reducer = createReducer<ScopeFrameworkState, ScopeFrameworkAction>(stateReducer);
