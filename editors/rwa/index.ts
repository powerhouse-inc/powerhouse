import Editor, { CustomEditorProps } from './editor';
import {
    RealWorldAssetsState,
    RealWorldAssetsLocalState,
    RealWorldAssetsAction,
} from '../../document-models/real-world-assets';
import { ExtendedEditor } from '../types';

export const module: ExtendedEditor<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState,
    CustomEditorProps
> = {
    Component: Editor,
    documentTypes: ['makerdao/rwa-portfolio'],
    config: {
        id: 'rwa-editor',
        disableExternalControls: true,
    },
};

export default module;
