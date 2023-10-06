import { createDocumentStory } from 'document-model-editors';

import { AccountSnapshotEditor } from './editor';
import { accountSnapshotStateMock } from './mocks';
import { reducer, utils } from '../../document-models/account-snapshot';

const { meta, CreateDocumentStory } = createDocumentStory(
    AccountSnapshotEditor,
    reducer,
    utils.createExtendedState({ state: accountSnapshotStateMock }),
);

export default { ...meta, title: 'Account Snapshot' };
export { CreateDocumentStory };
