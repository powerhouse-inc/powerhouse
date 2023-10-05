import { createDocumentStory } from 'document-model-editors';

import { AccountSnapshotEditor } from './editor';
import { reducer, utils } from '../../document-models/account-snapshot';

const { meta, CreateDocumentStory } = createDocumentStory(
    AccountSnapshotEditor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Account Snapshot' };
export { CreateDocumentStory };
