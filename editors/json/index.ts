import Editor from './editor';
import { EditorModule } from '../common';

const Module: EditorModule = {
    Component: Editor,
    documentTypes: ['*'],
};

export default Module;
