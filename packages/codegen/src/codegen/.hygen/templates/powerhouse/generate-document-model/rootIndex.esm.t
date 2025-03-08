---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/index.ts"
force: true
---
/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModelModule } from 'document-model';
import { actions as <%= h.changeCase.pascal(documentType) %>Actions } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import {
    <%= h.changeCase.pascal(documentType) %>Document,
} from './gen/types';

const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...<%= h.changeCase.pascal(documentType) %>Actions };

export const module: DocumentModelModule<
    <%= h.changeCase.pascal(documentType) %>Document
> = {
    reducer,
    actions,
    utils,
    documentModel,
};

export { reducer, actions, utils, documentModel };

export * from './gen/types';
export * from './src/utils';
