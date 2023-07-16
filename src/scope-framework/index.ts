/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions } from '../document';
import { reducer } from './gen/reducer';
import * as gen from './gen';
import { 
    createEmptyScopeFrameworkState, 
    createEmptyExtendedScopeFrameworkState 
} from './custom/utils';

const { ScopeFramework, ...ScopeFrameworkActions } = gen;
const actions = { ...BaseActions, ...ScopeFrameworkActions };

export {
    actions,
    reducer, 
    ScopeFramework,
    createEmptyScopeFrameworkState,
    createEmptyExtendedScopeFrameworkState
}