import { reducer, utils } from '../../document-models/real-world-assets';
import Editor from './editor';
import { createDocumentStory } from 'document-model-libs/utils';

const { meta, CreateDocumentStory: DocumentModel } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState(),
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
