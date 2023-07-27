import { isBaseAction } from "../../document/actions/types";
import { createReducer } from "../../document/utils";
import { ImmutableStateReducer } from "../../document/types";
import { ScopeFrameworkState, z } from '@acaldas/document-model-graphql/scope-framework';
import { ScopeFrameworkAction } from './actions';

import { reducer as MainReducer } from '../custom/reducers/main';


const stateReducer: ImmutableStateReducer<ScopeFrameworkState, ScopeFrameworkAction> =
    (state, action) => {
        if (isBaseAction(action)) {
            return state;
        }

        switch (action.type) {
            case "SET_ROOT_PATH":
                z.SetRootPathInputSchema().parse(action.input);
                MainReducer.setRootPathOperation(state, action);
                break;

            case "ADD_ELEMENT":
                z.AddElementInputSchema().parse(action.input);
                MainReducer.addElementOperation(state, action);
                break;

            case "UPDATE_ELEMENT_TYPE":
                z.UpdateElementTypeInputSchema().parse(action.input);
                MainReducer.updateElementTypeOperation(state, action);
                break;

            case "UPDATE_ELEMENT_NAME":
                z.UpdateElementNameInputSchema().parse(action.input);
                MainReducer.updateElementNameOperation(state, action);
                break;

            case "UPDATE_ELEMENT_COMPONENTS":
                z.UpdateElementComponentsInputSchema().parse(action.input);
                MainReducer.updateElementComponentsOperation(state, action);
                break;

            case "REMOVE_ELEMENT":
                z.RemoveElementInputSchema().parse(action.input);
                MainReducer.removeElementOperation(state, action);
                break;

            case "REORDER_ELEMENTS":
                z.ReorderElementsInputSchema().parse(action.input);
                MainReducer.reorderElementsOperation(state, action);
                break;

            case "MOVE_ELEMENT":
                z.MoveElementInputSchema().parse(action.input);
                MainReducer.moveElementOperation(state, action);
                break;

            default:
                return state;
        }
    }

export const reducer = createReducer<ScopeFrameworkState, ScopeFrameworkAction>(stateReducer);
