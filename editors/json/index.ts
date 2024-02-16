import { ExtendedEditor } from '../types';
import Editor from './editor';

export const module: ExtendedEditor = {
    Component: Editor,
    documentTypes: ['*'],
    config: {
        id: 'json-editor',
        disableExternalControls: false,
    },
};

export default module;
