import CodeEditor, { type EditorProps } from './monaco-editor';
import { useEffect, useState } from 'react';
import { styles } from 'document-model-libs/utils';

type IProps = Omit<EditorProps, 'value' | 'onChange' | 'theme'> & {
    readonly value: JSON;
    readonly onChange: (value: JSON) => void;
    readonly theme: styles.ColorTheme;
    readonly onBlur?: (value: JSON) => void;
};

export function isJSONEqual(json: JSON, text: string) {
    return JSON.stringify(json).replace(/\s/g, '') === text.replace(/\s/g, '');
}

export default function JSONEditor({
    value,
    onChange,
    theme,
    onBlur,
    ...props
}: IProps) {
    const [text, setText] = useState(JSON.stringify(value, null, 4));

    function handleChange(value?: string) {
        if (!value) {
            return;
        }
        try {
            const state = JSON.parse(value) as JSON;
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
            setText(JSON.stringify(value, null, 4));
        }
    }, [value]);

    return (
        <CodeEditor
            height="100%"
            language="json"
            onChange={(value) => setText(value ?? '')}
            theme={`vs-${theme}`}
            value={text}
            {...props}
            onMount={(editor) => {
                editor.onDidBlurEditorText(() => {
                    onBlur?.(JSON.parse(editor.getValue()) as JSON);
                });
            }}
            options={{
                lineNumbers: 'off',
                minimap: { enabled: false },
                ...props.options,
            }}
        />
    );
}
