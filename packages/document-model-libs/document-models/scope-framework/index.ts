/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from 'document-model/document';
import { actions as ScopeFrameworkActions, ScopeFramework } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import {
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState,
} from './gen/types';

const Document = ScopeFramework;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...ScopeFrameworkActions };

export const module: DocumentModel<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel,
};

export { ScopeFramework, Document, reducer, actions, utils, documentModel };

export * from './gen/types';
export * from './src/utils';
