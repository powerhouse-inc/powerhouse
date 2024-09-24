/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import {
    actions as BaseActions,
    DocumentModel as _DocumentModel,
} from '../document';
import * as customUtils from './custom/utils';
import { actions as DocumentModelActions, DocumentModel } from './gen';
import { documentModel } from './gen/document-model';
import { reducer } from './gen/reducer';
import {
    DocumentModelAction,
    DocumentModelLocalState,
    DocumentModelState,
} from './gen/types';
import genUtils from './gen/utils';

const Document = DocumentModel;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...DocumentModelActions };

export const module: _DocumentModel<
    DocumentModelState,
    DocumentModelAction,
    DocumentModelLocalState,
    DocumentModel
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel,
};

export * from './custom/utils';
export * from './gen/types';
export { DocumentModel, Document, reducer, actions, utils, documentModel };
