import { baseReducer, utils } from 'document-model/document';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory: JSONEditor } = createDocumentStory(
    Editor,
    (...args) => baseReducer(...args, document => document),
    utils.createExtendedState(),
);

export default { ...meta, title: 'JSON Editor' };

export { JSONEditor };
