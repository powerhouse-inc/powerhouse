import { SchemaEditor, SchemaEditorProps } from '@theguild/editor';
import { ColorTheme } from '../common/styles';

export interface IProps extends Omit<SchemaEditorProps, 'onChange'> {
    schema: string;
    onChange: (schema: string) => void;
    theme: ColorTheme;
}

const GraphQLEditor: React.FC<IProps> = ({
    schema,
    onChange,
    theme,
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
            options={{
                lineNumbers: 'off',
                lineNumbersMinChars: 0,
                minimap: { enabled: false },
                automaticLayout: true,
                ...props.options,
            }}
            onChange={value => onChange(value ?? '')}
        />
    );
};

export default GraphQLEditor;
