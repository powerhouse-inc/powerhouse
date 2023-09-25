import {
    DocumentModelState,
    DocumentModelAction,
} from 'document-model/document-model';
import Editor from './editor';
import { EditorModule } from '../common';

const Module: EditorModule<DocumentModelState, DocumentModelAction> = {
    Component: Editor,
    documentTypes: ['powerhouse/document-model'],
};

export default Module;
