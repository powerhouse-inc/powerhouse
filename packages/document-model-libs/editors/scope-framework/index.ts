import { lazyWithPreload } from 'document-model-libs/utils';
import type {
    ScopeFrameworkAction,
    ScopeFrameworkLocalState,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';
import type { ExtendedEditor } from '../types';

export const module: ExtendedEditor<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState
> = {
    Component: lazyWithPreload(() => import('./editor')),
    documentTypes: ['makerdao/scope-framework'],
    config: {
        id: 'scope-framework-editor',
        disableExternalControls: false,
    },
};

export default module;
