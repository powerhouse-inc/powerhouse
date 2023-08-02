/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions } from '../document';
import * as gen from './gen';
import { reducer } from './gen/reducer';

const { ScopeFramework, ...ScopeFrameworkActions } = gen;
const actions = { ...BaseActions, ...ScopeFrameworkActions };

export * from './custom/utils';
export type {
    ExtendedScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkDocument,
    ScopeFrameworkState,
    types,
} from './gen';
export { actions, reducer, ScopeFramework };
