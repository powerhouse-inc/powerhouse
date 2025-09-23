---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/index.ts"
force: true
---
/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { createState, type DocumentModelModule } from 'document-model';
import { actions as BaseActions, defaultBaseState } from 'document-model/core';
import { actions as <%= h.changeCase.pascal(documentType) %>Actions } from './gen/index.js';
import { reducer } from './gen/reducer.js';
import { documentModel } from './gen/document-model.js';
import genUtils from './gen/utils.js';
import * as customUtils from './src/utils.js';
import type { <%= h.changeCase.pascal(documentType) %>PHState } from './gen/types.js';

const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...<%= h.changeCase.pascal(documentType) %>Actions };

export const module: DocumentModelModule<
    <%= h.changeCase.pascal(documentType) %>PHState
> = {
    reducer,
    actions,
    utils,
    documentModel: createState(defaultBaseState(), documentModel),
};

export { reducer, actions, utils, documentModel };

export * from './gen/types.js';
export * from './src/utils.js';
