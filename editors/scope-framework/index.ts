import {
    ScopeFrameworkAction,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';
import { EditorModule } from '../common';
import Editor from './editor';

const Module: EditorModule<ScopeFrameworkState, ScopeFrameworkAction> = {
    Component: Editor,
    documentTypes: ['makerdao/scope-framework'],
};

export default Module;
