import { lazyWithPreload } from 'document-model-libs/utils';
import type { ExtendedEditor } from '../types';

export const module: ExtendedEditor = {
    Component: lazyWithPreload(() => import('./editor')),
    documentTypes: ['*'],
    config: {
        id: 'json-editor',
        disableExternalControls: false,
    },
};

export default module;
