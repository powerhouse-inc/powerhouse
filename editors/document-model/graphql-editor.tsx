import { SchemaEditor, SchemaEditorProps } from '@theguild/editor';
import { styles } from 'document-model-editors';
import {
    constrainedEditor,
    ConstrainedEditorRestriction,
} from 'constrained-editor-plugin';

export interface IProps extends Omit<SchemaEditorProps, 'onChange'> {
    schema: string;
    theme: styles.ColorTheme;
    restrictions?: ConstrainedEditorRestriction[];
}

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
