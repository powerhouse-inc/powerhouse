import type { SchemaEditorProps } from '@theguild/editor';
import { lazyWithPreload, styles } from 'document-model-libs/utils';
import {
    constrainedEditor,
    ConstrainedEditorRestriction,
} from 'constrained-editor-plugin';

export interface IProps extends Omit<SchemaEditorProps, 'onChange'> {
    schema: string;
    theme: styles.ColorTheme;
    restrictions?: ConstrainedEditorRestriction[];
}
export type { SchemaEditorProps } from '@theguild/editor';
export const SchemaEditor = lazyWithPreload(async () => ({
    default: (await import('@theguild/editor')).SchemaEditor,
}));

const GraphQLEditor: React.FC<IProps> = ({
    schema,
    theme,
    restrictions,
    ...props
}) => {
    return (
        <SchemaEditor
            schema="type Test { name: String }"
            height={100}
            theme={`vs-${theme}`}
            defaultValue={schema}
            line={2}
            {...props}
            onMount={(editor, monaco) => {
                if (!restrictions) return;

                const constrainedInstance = constrainedEditor(monaco);
                const model = editor.getModel();
                constrainedInstance.initializeIn(editor);

                constrainedInstance.addRestrictionsTo(model, restrictions);
            }}
            options={{
                lineNumbers: 'off',
                lineNumbersMinChars: 0,
                minimap: { enabled: false },
                automaticLayout: true,
                ...props.options,
            }}
        />
    );
};

export default GraphQLEditor;
