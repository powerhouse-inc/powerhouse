import { createDocumentStory } from 'document-model-libs/utils';
import {
    SignalDispatch,
    baseReducer,
    utils,
    type Document,
} from 'document-model/document';
import Editor from './editor';

const { meta, CreateDocumentStory: JSONEditor } = createDocumentStory(
    Editor,
    (
        state: Document<unknown, any>,
        action: any,
        dispatch: SignalDispatch | undefined,
    ) => baseReducer(state, action, (document) => document, dispatch),
    utils.createExtendedState(),
);

export default { ...meta, title: 'JSON Editor' };

export { JSONEditor };
