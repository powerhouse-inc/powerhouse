/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from 'document-model/document';
import { actions as AccountSnapshotActions, AccountSnapshot } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import {
    AccountSnapshotState,
    AccountSnapshotAction,
    AccountSnapshotLocalState,
} from './gen/types';

const Document = AccountSnapshot;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...AccountSnapshotActions };

export const module: DocumentModel<
    AccountSnapshotState,
    AccountSnapshotAction,
    AccountSnapshotLocalState
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel,
};

export { AccountSnapshot, Document, reducer, actions, utils, documentModel };

export * from './gen/types';
export * from './src/utils';
