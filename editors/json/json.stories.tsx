import { baseReducer, utils } from 'document-model/document';
import Editor from './editor';
import { createDocumentStory } from '../common/utils';

const { meta, CreateDocumentStory } = createDocumentStory(
    Editor,
    (...args) => baseReducer(...args, document => document),
    utils.createExtendedState(),
);

export default { ...meta, title: 'JSON Editor' };

export { CreateDocumentStory };
