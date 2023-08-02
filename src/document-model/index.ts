import { actions as BaseActions } from '../document';
import {
    createEmptyDocumentModelState,
    createEmptyExtendedDocumentModelState,
} from './custom/utils';
import * as gen from './gen';
import { reducer } from './gen/reducer';
const { DocumentModel, ...DocumentModelActions } = gen;
const actions = { ...BaseActions, ...DocumentModelActions };

export * from './custom/utils';
export type {
    DocumentModelAction,
    DocumentModelDocument,
    DocumentModelState,
    ExtendedDocumentModelState,
    types,
} from './gen';
export {
    actions,
    reducer,
    DocumentModel,
    createEmptyDocumentModelState,
    createEmptyExtendedDocumentModelState,
};
