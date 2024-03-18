import { Editor as CodeEditor, EditorProps } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { styles } from 'document-model-libs/utils';
import { isJSONEqual } from '../common/json-editor';

interface IProps extends EditorProps {
    validator?: () => z.AnyZodObject;
    onCreate: (create: string) => void;
    theme: styles.ColorTheme;
    setInitialValue?: boolean;
}

export default function EditorInitialState({
    validator,
    onCreate,
    theme,
    setInitialValue,
    ...props
}: IProps) {
    const [code, setCode] = useState(props.value || '{}');

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    useEffect(() => {
        if (!editorRef.current) {
            return;
        }
        editorRef.current.onDidBlurEditorText(e => {
            const value = editorRef.current?.getValue() ?? '{}';
            onCreate(value);
        });
    }, [editorRef.current]);

    useEffect(() => {
        if (
            setInitialValue &&
            !isJSONEqual(JSON.parse(props.value || '{}') as JSON, code)
        ) {
            setCode(props.value || '{}');
        }
    }, [setInitialValue, props.value]);

    let errorMessage = '';
    let valid = false;
    try {
        const initialState = JSON.parse(code);
        if (validator) {
            valid = validator().strict().safeParse(initialState).success;
            if (!valid) {
                errorMessage = 'Invalid initial state';
            }
        }
    } catch (error) {
        errorMessage = 'Invalid JSON';
    }

    return (
        <div>
            <CodeEditor
                theme={`vs-${theme}`}
                width="100%"
                height="60vh"
                language="json"
                onChange={value => setCode(value ?? '')}
                {...props}
                value={code}
                onMount={async (editor, monaco) => {
                    editorRef.current = editor;
                    props.onMount?.(editor, monaco);
                    setTimeout(async () => {
                        try {
                            await editor
                                .getAction('editor.action.formatDocument')
                                ?.run();
                        } catch (error) {
                            console.error(error);
                        }
                    }, 50);
                }}
                options={{
                    lineNumbers: 'off',
                    lineNumbersMinChars: 0,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    ...props.options,
                }}
            />
            <p
                style={{
                    minHeight: 20,
                    marginTop: 10,
                    fontSize: '1.1rem',
                    color: 'red',
                }}
            >
                {errorMessage}
            </p>
        </div>
    );
}
