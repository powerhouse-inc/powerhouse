import { reducer, utils } from 'document-model/document-model';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory } = createDocumentStory(
    Editor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Document Model' };

export { CreateDocumentStory };
