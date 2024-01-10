declare module 'constrained-editor-plugin' {
    interface ConstrainedEditorRestriction {
        range: number[];
        allowMultiline: boolean;
    }

    interface ConstrainedInstance {
        initializeIn: (editor: editor.IStandaloneCodeEditor) => void;
        addRestrictionsTo: (
            model: editor.ITextModel | null,
            restrictions: ConstrainedEditorRestriction[],
        ) => void;
    }

    export function constrainedEditor(
        monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'),
    ): ConstrainedInstance;
}
