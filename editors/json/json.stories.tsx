import { baseReducer, utils } from 'document-model/document';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory: JSONEditor } = createDocumentStory(
    Editor,
    (state, action, dispatch) => baseReducer(state, action, document => document, dispatch),
    utils.createExtendedState(),
);

export default { ...meta, title: 'JSON Editor' };

export { JSONEditor };
