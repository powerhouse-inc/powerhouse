import type { Action, BaseAction, Document } from 'document-model/document';

export type EditorContext = {
    theme: 'light' | 'dark';
    debug?: boolean;
};

export type EditorProps<S, A extends Action, L> = {
    document: Document<S, A, L>;
    dispatch: (action: A | BaseAction) => void;
    editorContext: EditorContext;
    error?: unknown;
};
