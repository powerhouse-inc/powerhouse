import { Editor } from 'document-model/document';
import { AccountSnapshotEditor } from './editor';
import {
    AccountSnapshotState,
    AccountSnapshotAction,
} from '../../document-models/account-snapshot';

export const module: Editor<AccountSnapshotState, AccountSnapshotAction> = {
    Component: AccountSnapshotEditor,
    documentTypes: ['powerhouse/account-snapshot'],
};

export default module;
