declare module 'constrained-editor-plugin' {
    interface ConstrainedEditorRestriction {
        range: number[];
        allowMultiline: boolean;
    }

    interface ConstrainedInstance {
        initializeIn: (editor: editor.IStandaloneCodeEditor) => void;
        addRestrictionsTo: (
            // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
            model: editor.ITextModel | null,
            restrictions: ConstrainedEditorRestriction[],
        ) => void;
    }

    export function constrainedEditor(
        monaco: typeof import('monaco-editor/esm/vs/editor/editor.api'),
    ): ConstrainedInstance;
}
