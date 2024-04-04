import { createDocumentStory } from 'document-model-libs/utils';
import { reducer, utils } from '../../document-models/real-world-assets';
import { initialState } from '../../document-models/real-world-assets/mock-data/initial-state';
import Editor from './editor';

const { meta, CreateDocumentStory: DocumentModel } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState({
        state: {
            global: initialState,
            local: {},
        },
    }),
);

export default {
    ...meta,
    title: 'Real World Assets',
    argTypes: {
        ...meta.argTypes,
        onExport: { control: { type: 'action' } },
        onClose: { control: { type: 'action' } },
    },
};

export { DocumentModel };
