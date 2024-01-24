import { reducer, utils } from '../../document-models/scope-framework';
import Editor from './editor';
import { createDocumentStory } from 'document-model-editors';

const { meta, CreateDocumentStory: ScopeFramework } = createDocumentStory(
    // @ts-expect-error todo update type
    Editor,
    reducer,
    utils.createExtendedState(),
);

export default { ...meta, title: 'Scope Framework' };

export { ScopeFramework };
