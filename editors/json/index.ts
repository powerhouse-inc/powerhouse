import { Editor as EditorModule } from 'document-model/document';
import Editor from './editor';

export const module: EditorModule = {
    Component: Editor,
    documentTypes: ['*'],
};

export default module;
