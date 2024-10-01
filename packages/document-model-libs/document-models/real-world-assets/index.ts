/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from 'document-model/document';
import { actions as RealWorldAssetsActions, RealWorldAssets } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import {
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState,
} from './gen/types';

const Document = RealWorldAssets;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...RealWorldAssetsActions };

export const module: DocumentModel<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel,
};

export { RealWorldAssets, Document, reducer, actions, utils, documentModel };

export * from './gen/types';
export * from './src/utils';
