import { Editor as EditorModule } from 'document-model/document';
import Editor from './editor';
import {
    DocumentModelAction,
    DocumentModelState,
} from 'document-model/document-model';

export const module: EditorModule<DocumentModelState, DocumentModelAction> = {
    // @ts-expect-error todo update type
    Component: Editor,
    documentTypes: ['powerhouse/document-model'],
};

export default module;
