/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions, DocumentModel } from 'document-model/document';
import { actions as DocumentDriveActions, DocumentDrive } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import { DocumentDriveState, DocumentDriveAction, DocumentDriveLocalState } from './gen/types';

const Document = DocumentDrive;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...DocumentDriveActions };

export const module: DocumentModel<
    DocumentDriveState,
    DocumentDriveAction,
    DocumentDriveLocalState,
    DocumentDrive
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel
};

export {
    DocumentDrive,
    Document,
    reducer,
    actions,
    utils,
    documentModel
}

export * from './gen/types';
export * from './src/utils';