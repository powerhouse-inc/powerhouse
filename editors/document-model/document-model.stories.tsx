import { reducer, utils } from 'document-model/document-model';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory: DocumentModel } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Document Model' };

export { DocumentModel };
