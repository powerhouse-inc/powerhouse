import { Editor as EditorModule } from 'document-model/document';
import Editor from './editor';
import {
    ScopeFrameworkAction,
    ScopeFrameworkLocalState,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';

export const module: EditorModule<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState
> = {
    Component: Editor,
    documentTypes: ['makerdao/scope-framework'],
};

export default module;
