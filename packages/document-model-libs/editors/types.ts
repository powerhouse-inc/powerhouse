import React from 'react';
import { Action, EditorProps } from 'document-model/document';

export type EditorConfig = {
    id: string;
    disableExternalControls: boolean;
};

export type ExtendedEditor<
    S = unknown,
    A extends Action = Action,
    L = unknown,
    CustomProps = unknown,
> = {
    Component: React.FC<
        EditorProps<S, A, L> & CustomProps & Record<string, unknown>
    >;
    documentTypes: string[];
    config?: Partial<EditorConfig>;
};
