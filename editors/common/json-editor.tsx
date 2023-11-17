import { Editor as CodeEditor, EditorProps } from '@monaco-editor/react';
import { useEffect, useState } from 'react';
import { styles } from 'document-model-editors';

type IProps = Omit<EditorProps, 'value' | 'onChange' | 'theme'> & {
    value: JSON;
    onChange: (value: JSON) => void;
    theme: styles.ColorTheme;
};

export function isJSONEqual(json: JSON, text: string) {
    return JSON.stringify(json).replace(/\s/g, '') === text.replace(/\s/g, '');
}

export default function JSONEditor({
    value,
    onChange,
    theme,
    ...props
}: IProps) {
    const [text, setText] = useState(JSON.stringify(value, null, 4));

    function handleChange(value?: string) {
        if (!value) {
            return;
        }
        try {
            const state = JSON.parse(value);
            onChange(state);
        } catch {
            /* empty */
        }
    }

    useEffect(() => {
        handleChange(text);
    }, [text]);

    useEffect(() => {
        if (!isJSONEqual(value, text)) {
            setText(JSON.stringify(value));
        }
    }, [value]);

    return (
        <CodeEditor
            height="100%"
            language="json"
            value={text}
            theme={`vs-${theme}`}
            onChange={value => setText(value ?? '')}
            {...props}
            options={{
                lineNumbers: 'off',
                minimap: { enabled: false },
                ...props.options,
            }}
        />
    );
}
