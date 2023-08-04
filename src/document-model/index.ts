/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions, DocumentModelModule } from '../document';
import { actions as DocumentModelActions, DocumentModel } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './custom/utils';
import { DocumentModelState, DocumentModelAction } from './gen/types';

const Document = DocumentModel;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...DocumentModelActions };

export const module: DocumentModelModule<
    DocumentModelState,
    DocumentModelAction,
    DocumentModel
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel
};

export {
    DocumentModel,
    Document,
    reducer,
    actions,
    utils,
    documentModel
}

export * from './gen/types';
export * from './custom/utils';