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
            defaultValue={schema}
            height={100}
            line={2}
            schema="type Test { name: String }"
            theme={`vs-${theme}`}
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
