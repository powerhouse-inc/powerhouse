import { createDocumentStory } from 'document-model-editors';
import { reducer, utils } from '../../document-models/scope-framework';
import Editor from './editor';

const { meta, CreateDocumentStory: ScopeFramework } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState({
        lastModified: '2021-03-10T10:00:00.000Z',
    }),
);

export default {
    ...meta,
    title: 'Scope Framework',
    parameters: {
        date: new Date('March 10, 2021 10:00:00'),
    },
};

export { ScopeFramework };
