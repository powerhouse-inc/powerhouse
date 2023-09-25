import { SchemaEditor } from '@theguild/editor';
import { ColorTheme } from '../common/styles';

export interface IProps {
    schema: string;
    onChange: (schema: string) => void;
    theme: ColorTheme;
}

const GraphQLEditor: React.FC<IProps> = ({ schema, onChange, theme }) => {
    return (
        <SchemaEditor
            schema="type Test { name: String }"
            height={100}
            theme={`vs-${theme}`}
            defaultValue={schema}
            line={2}
            options={{
                lineNumbers: 'off',
                lineNumbersMinChars: 0,
                minimap: { enabled: false },
                automaticLayout: true,
            }}
            onLanguageServiceReady={console.log}
            onChange={value => onChange(value ?? '')}
        />
    );
};

export default GraphQLEditor;
