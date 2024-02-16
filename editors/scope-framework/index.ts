import Editor from './editor';
import {
    ScopeFrameworkAction,
    ScopeFrameworkLocalState,
    ScopeFrameworkState,
} from '../../document-models/scope-framework';
import { ExtendedEditor } from '../types';

export const module: ExtendedEditor<
    ScopeFrameworkState,
    ScopeFrameworkAction,
    ScopeFrameworkLocalState
> = {
    Component: Editor,
    documentTypes: ['makerdao/scope-framework'],
    config: {
        id: 'scope-framework-editor',
        disableExternalControls: false,
    },
};

export default module;
