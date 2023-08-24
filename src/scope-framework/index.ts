/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions } from '../document';
import * as customUtils from './custom/utils';
import { actions as ScopeFrameworkActions, ScopeFramework } from './gen';
import { documentModel } from './gen/document-model';
import { reducer } from './gen/reducer';
import { ScopeFrameworkAction, ScopeFrameworkState } from './gen/types';
import genUtils from './gen/utils';

const Document = ScopeFramework;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...ScopeFrameworkActions };

export const module: DocumentModel<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFramework
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel,
};

export * from './custom/utils';
export * from './gen/types';
export { ScopeFramework, Document, reducer, actions, utils, documentModel };
