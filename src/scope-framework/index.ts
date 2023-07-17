/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions } from '../document';
import {
    createEmptyExtendedScopeFrameworkState,
    createEmptyScopeFrameworkState,
} from './custom/utils';
import * as gen from './gen';
import { reducer } from './gen/reducer';

export type {
    ExtendedScopeFrameworkState,
    ScopeFrameworkAction,
    types,
} from './gen';
export {
    actions,
    reducer,
    ScopeFramework,
    createEmptyScopeFrameworkState,
    createEmptyExtendedScopeFrameworkState,
};

const { ScopeFramework, ...ScopeFrameworkActions } = gen;
const actions = { ...BaseActions, ...ScopeFrameworkActions };
