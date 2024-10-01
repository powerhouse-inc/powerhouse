import type { CustomEditorProps } from './editor';
import type {
    RealWorldAssetsState,
    RealWorldAssetsLocalState,
    RealWorldAssetsAction,
} from '../../document-models/real-world-assets';
import type { ExtendedEditor } from '../types';
import { lazyWithPreload } from 'document-model-libs/utils';

export const module: ExtendedEditor<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState,
    CustomEditorProps
> = {
    Component: lazyWithPreload(() => import('./editor')),
    documentTypes: ['makerdao/rwa-portfolio'],
    config: {
        id: 'rwa-editor',
        disableExternalControls: true,
    },
};

export default module;
