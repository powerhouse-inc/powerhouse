import { reducer, utils } from 'document-model/document-model';
import Editor from './editor';
import { createDocumentStory } from 'document-model-libs/utils';

const { meta, CreateDocumentStory: DocumentModel } = createDocumentStory(
    Editor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Document Model' };

export { DocumentModel };
