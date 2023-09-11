import {
    ScopeFrameworkAction,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';
import { type EditorModule } from '../common';
import Editor from './editor';

const Module: EditorModule<ScopeFrameworkState, ScopeFrameworkAction> = {
    Component: Editor,
    documentTypes: ['powerhouse/scope-framework'],
};

export default Module;
