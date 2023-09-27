import { Editor as EditorModule } from 'document-model/document';
import Editor from './editor';
import {
    ScopeFrameworkAction,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';

export const module: EditorModule<ScopeFrameworkState, ScopeFrameworkAction> = {
    Component: Editor,
    documentTypes: ['makerdao/scope-framework'],
};

export default module;
