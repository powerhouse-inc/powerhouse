import Editor from './editor';
import { ExtendedEditor } from '../types';
import {
    DocumentModelAction,
    DocumentModelState,
} from 'document-model/document-model';

export const module: ExtendedEditor<DocumentModelState, DocumentModelAction> = {
    // @ts-expect-error todo update type
    Component: Editor,
    documentTypes: ['powerhouse/document-model'],
    config: {
        id: 'document-model-editor',
        disableExternalControls: false,
    },
};

export default module;
