import { reducer, utils } from '../../document-models/real-world-assets';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory: DocumentModel } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Real World Assets' };

export { DocumentModel };
